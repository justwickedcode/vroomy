package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	headerUserID     = "X-Vroomy-User-Id"
	headerUserName   = "X-Vroomy-User-Name"
	headerUserEmail  = "X-Vroomy-User-Email"
	headerUserAvatar = "X-Vroomy-User-Avatar"

	maxCosmeticFieldLen = 64
	maxDisplayNameLen   = 255

	// Sanity ceilings, not real game rules — same spirit as quotes.go's maxWordsCeiling, just
	// guarding against a malformed or hostile payload rather than modeling an actual limit.
	maxWPM         = 500
	maxRacerCount  = 64
	maxImportBatch = 50 // mirrors the old client-side MAX_RACE_HISTORY cap (frontend/useProfile.ts)

	// One race with a full replay is a few KB; this leaves generous headroom while still
	// refusing to buffer an arbitrarily large body.
	maxRaceBodyBytes = 256 << 10
)

// identity is the caller's verified Casdoor identity, forwarded by frontend's server as plain
// headers — see withIdentity below for why these are safe to trust without their own signature.
type identity struct {
	id          string
	displayName string
	email       string
	avatarURL   string
}

// withIdentity rejects any request with no X-Vroomy-User-Id header, then hands the handler a
// parsed identity. api has no public domain (see docker-compose.yml) and is reachable only from
// frontend's own internal proxy — these headers are only ever set there, after frontend has
// independently verified the caller's Casdoor session, never by a browser directly. Same trust
// model as the already-established X-Forwarded-For passthrough in handleRandomQuote: nothing
// outside this closed compose network can ever set them.
func withIdentity(next func(http.ResponseWriter, *http.Request, identity)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(headerUserID)
		if id == "" {
			writeError(w, http.StatusUnauthorized, "missing identity")
			return
		}
		next(w, r, identity{
			id:          id,
			displayName: truncate(r.Header.Get(headerUserName), maxDisplayNameLen),
			email:       r.Header.Get(headerUserEmail),
			avatarURL:   r.Header.Get(headerUserAvatar),
		})
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

// RaceResult is one completed race, as stored and as returned to the client.
type RaceResult struct {
	ID         int64  `json:"id"`
	Date       string `json:"date"`
	Mode       string `json:"mode"`
	WPM        int    `json:"wpm"`
	Accuracy   int    `json:"accuracy"`
	Placement  int    `json:"placement"`
	RacerCount int    `json:"racerCount"`
	HasReplay  bool   `json:"hasReplay"`
	// CoinsEarned and Achievements are set only on the POST response: what this race paid (see
	// coinsForRace) and any achievements it newly unlocked (paid on top — see syncAchievements).
	CoinsEarned  int                   `json:"coinsEarned,omitempty"`
	Achievements []UnlockedAchievement `json:"achievements,omitempty"`
}

// raceModes are the kinds of race the frontend records. An empty mode (an older client, or an
// import from before modes existed) is stored as "solo".
var raceModes = map[string]bool{"solo": true, "multiplayer": true, "daily": true}

// ProfileStats mirrors frontend/src/lib/profile/useProfile.ts's ProfileStats shape exactly, so
// the frontend can drop its own client-side computeStats once it reads this directly — computed
// here over the user's full race history, not a capped recent window like the old localStorage
// version needed (Postgres has no reason to cap stored rows the way local storage size did).
type ProfileStats struct {
	RacesPlayed int `json:"racesPlayed"`
	BestWPM     int `json:"bestWpm"`
	AvgWPM      int `json:"avgWpm"`
	AvgAccuracy int `json:"avgAccuracy"`
	Wins        int `json:"wins"`
}

// UserProfile is the full GET /api/users/me response: identity, cosmetics, a bounded recent-race
// window for display, and lifetime stats computed independently of that window's size.
type UserProfile struct {
	ID              string       `json:"id"`
	DisplayName     string       `json:"displayName"`
	Email           string       `json:"email,omitempty"`
	AvatarURL       string       `json:"avatarUrl,omitempty"`
	CarModel        string       `json:"carModel"`
	Underglow       bool         `json:"underglow"`
	UnderglowColor  string       `json:"underglowColor"`
	Trail           string       `json:"trail"`
	EquippedPowerup string       `json:"equippedPowerup"`
	Races           []RaceResult `json:"races"`
	Stats           ProfileStats `json:"stats"`
	Coins           int          `json:"coins"`
	Owned           []string     `json:"owned"`
	// Achievements is the ids of every achievement unlocked (and paid) so far.
	Achievements []string `json:"achievements"`
}

// upsertIdentity guarantees a users row exists and its identity-owned columns (name/email/
// avatar — whatever Casdoor itself owns) stay fresh, regardless of call order between the
// endpoints below. Cosmetic columns are left at their DEFAULT on first insert and untouched on
// conflict here — only updateCosmetics (below) ever writes them.
//
// COALESCE(NULLIF(excluded.x, ”), users.x) rather than a bare "excluded.x": not every endpoint
// that calls this forwards the full identity (e.g. handlePostRace only needs X-Vroomy-User-Id to
// do its job) — an unconditional overwrite would blank a previously-stored display name/email/
// avatar back to empty on any call that only sent the id header. Caught live: a PUT cosmetics
// call sending only the id header wiped a display name GET /me had just set moments before.
func upsertIdentity(ctx context.Context, pool *pgxpool.Pool, id identity) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO users (id, display_name, email, avatar_url)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (id) DO UPDATE SET
			display_name = COALESCE(NULLIF(excluded.display_name, ''), users.display_name),
			email = COALESCE(NULLIF(excluded.email, ''), users.email),
			avatar_url = COALESCE(NULLIF(excluded.avatar_url, ''), users.avatar_url),
			updated_at = NOW()
	`, id.id, id.displayName, id.email, id.avatarURL)
	return err
}

// userRow is every column the frontend needs back on every response — read fresh from the
// database rather than echoed from the current request's headers, so a call that only forwarded
// X-Vroomy-User-Id (e.g. handlePostRace) still returns the real stored name/email/avatar instead
// of blanks.
type userRow struct {
	displayName, email, avatarURL                    string
	carModel, underglowColor, trail, equippedPowerup string
	underglow                                        bool
	coins                                            int
	owned                                            []string
}

func loadUserRow(ctx context.Context, pool *pgxpool.Pool, userID string) (userRow, error) {
	var row userRow
	err := pool.QueryRow(ctx, `
		SELECT display_name, COALESCE(email, ''), COALESCE(avatar_url, ''), car_model, underglow,
		       underglow_color, trail, equipped_powerup, coins, owned
		FROM users WHERE id = $1
	`, userID).Scan(&row.displayName, &row.email, &row.avatarURL, &row.carModel, &row.underglow,
		&row.underglowColor, &row.trail, &row.equippedPowerup, &row.coins, &row.owned)
	return row, err
}

func computeStats(ctx context.Context, pool *pgxpool.Pool, userID string) (ProfileStats, error) {
	var stats ProfileStats
	err := pool.QueryRow(ctx, `
		SELECT
			COUNT(*)::int,
			COALESCE(MAX(wpm), 0)::int,
			COALESCE(ROUND(AVG(wpm))::int, 0),
			COALESCE(ROUND(AVG(accuracy))::int, 0),
			COUNT(*) FILTER (WHERE placement = 1)::int
		FROM race_results
		WHERE user_id = $1
	`, userID).Scan(&stats.RacesPlayed, &stats.BestWPM, &stats.AvgWPM, &stats.AvgAccuracy, &stats.Wins)
	return stats, err
}

// listRecentRaces returns at most limit races, newest first — a display window, not the
// lifetime record computeStats reads from (see UserProfile's own doc comment).
func listRecentRaces(ctx context.Context, pool *pgxpool.Pool, userID string, limit int) ([]RaceResult, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, mode, wpm, accuracy, placement, racer_count, replay IS NOT NULL, created_at
		FROM race_results
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	races := []RaceResult{}
	for rows.Next() {
		var r RaceResult
		var createdAt time.Time
		if err := rows.Scan(&r.ID, &r.Mode, &r.WPM, &r.Accuracy, &r.Placement, &r.RacerCount, &r.HasReplay, &createdAt); err != nil {
			return nil, err
		}
		r.Date = createdAt.Format(time.RFC3339)
		races = append(races, r)
	}
	return races, rows.Err()
}

func loadFullProfile(ctx context.Context, pool *pgxpool.Pool, userID string) (UserProfile, error) {
	row, err := loadUserRow(ctx, pool, userID)
	if err != nil {
		return UserProfile{}, err
	}
	races, err := listRecentRaces(ctx, pool, userID, 50)
	if err != nil {
		return UserProfile{}, err
	}
	stats, err := computeStats(ctx, pool, userID)
	if err != nil {
		return UserProfile{}, err
	}
	achievements, err := listAchievements(ctx, pool, userID)
	if err != nil {
		return UserProfile{}, err
	}
	return UserProfile{
		ID:              userID,
		DisplayName:     row.displayName,
		Email:           row.email,
		AvatarURL:       row.avatarURL,
		CarModel:        row.carModel,
		Underglow:       row.underglow,
		UnderglowColor:  row.underglowColor,
		Trail:           row.trail,
		EquippedPowerup: row.equippedPowerup,
		Races:           races,
		Stats:           stats,
		Coins:           row.coins,
		Owned:           row.owned,
		Achievements:    achievements,
	}, nil
}

// handleGetMe serves GET /api/users/me: ensures the row exists (first login or returning
// visitor, same codepath either way) and returns the full profile.
func handleGetMe(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		if err := upsertIdentity(r.Context(), pool, id); err != nil {
			log.Printf("upsertIdentity failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		// Normally a no-op; pays out anything already earned that hasn't been (back pay for
		// achievements unlocked before they had rewards).
		if _, err := syncAchievements(r.Context(), pool, id.id); err != nil {
			log.Printf("syncAchievements failed: %s\n", err)
		}
		profile, err := loadFullProfile(r.Context(), pool, id.id)
		if err != nil {
			log.Printf("loadFullProfile failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, profile)
	})
}

type cosmeticsRequest struct {
	CarModel        string `json:"carModel"`
	Underglow       bool   `json:"underglow"`
	UnderglowColor  string `json:"underglowColor"`
	Trail           string `json:"trail"`
	EquippedPowerup string `json:"equippedPowerup"`
}

// handlePutCosmetics serves PUT /api/users/me/cosmetics. Anything with a price in the shop
// catalog must already be owned (see cosmeticsOwned) — otherwise the garage's prices could be
// skipped with a direct request. Values the catalog doesn't know are only length-capped, same
// spirit as truncate above; the frontend never offers them.
func handlePutCosmetics(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		var req cosmeticsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if req.CarModel == "" || req.Trail == "" || req.EquippedPowerup == "" || req.UnderglowColor == "" {
			writeError(w, http.StatusBadRequest, "carModel, trail, equippedPowerup, and underglowColor are required")
			return
		}

		ctx := r.Context()
		if err := upsertIdentity(ctx, pool, id); err != nil {
			log.Printf("upsertIdentity failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		var owned []string
		if err := pool.QueryRow(ctx, `SELECT owned FROM users WHERE id = $1`, id.id).Scan(&owned); err != nil {
			log.Printf("load owned failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if !cosmeticsOwned(owned, req) {
			writeError(w, http.StatusForbidden, "buy that in the garage first")
			return
		}
		_, err := pool.Exec(ctx, `
			UPDATE users SET
				car_model = $2,
				underglow = $3,
				underglow_color = $4,
				trail = $5,
				equipped_powerup = $6,
				updated_at = NOW()
			WHERE id = $1
		`, id.id, truncate(req.CarModel, maxCosmeticFieldLen), req.Underglow,
			truncate(req.UnderglowColor, maxCosmeticFieldLen),
			truncate(req.Trail, maxCosmeticFieldLen),
			truncate(req.EquippedPowerup, maxCosmeticFieldLen))
		if err != nil {
			log.Printf("update cosmetics failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		profile, err := loadFullProfile(ctx, pool, id.id)
		if err != nil {
			log.Printf("loadFullProfile failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, profile)
	})
}

type raceRequest struct {
	WPM        int           `json:"wpm"`
	Accuracy   int           `json:"accuracy"`
	Placement  int           `json:"placement"`
	RacerCount int           `json:"racerCount"`
	Mode       string        `json:"mode"`
	Passage    string        `json:"passage"`
	Replay     []replayEvent `json:"replay"`
	// DailyDate is the player's local date for a mode "daily" race (see daily.go's
	// parseDailyDate) — the race then also counts toward that day's daily-challenge result.
	DailyDate string `json:"dailyDate"`
	// LocalHour is the hour (0-23) on the player's own clock when they finished, for the Early
	// bird / Night owl achievements. Optional.
	LocalHour *int `json:"localHour"`
	// Ticket is the race ticket this race is saved against (see tickets.go).
	Ticket string `json:"ticket"`

	// serverResult is set once the result has been replaced with the ws server's own measurement
	// (a multiplayer ticket) — then there's no claimed WPM left to check against the replay.
	serverResult bool
}

// normalize fills in defaults before validation — kept separate from validate so validate stays
// a pure check.
func (req *raceRequest) normalize() {
	if req.Mode == "" {
		req.Mode = "solo"
	}
}

// replayColumns returns the passage and replay values to store: both NULL unless the race came
// with a replay, so a passage is never stored without the timeline that makes it useful.
func (req raceRequest) replayColumns() (any, any, error) {
	if len(req.Replay) == 0 {
		return nil, nil, nil
	}
	raw, err := json.Marshal(req.Replay)
	if err != nil {
		return nil, nil, err
	}
	return req.Passage, raw, nil
}

func (req raceRequest) validate() string {
	if !raceModes[req.Mode] {
		return "unknown mode"
	}
	if req.LocalHour != nil && (*req.LocalHour < 0 || *req.LocalHour > 23) {
		return "localHour out of range"
	}
	if req.WPM < 0 || req.WPM > maxWPM {
		return "wpm out of range"
	}
	// A race comes with its replay, and the replay has to back the score up (see anticheat.go).
	// Only a result the ws server measured itself stands without one (a replay too long to
	// record), and its WPM is the server's, not a claim to check.
	if len(req.Replay) == 0 {
		if req.serverResult {
			return ""
		}
		return "replay required"
	}
	if msg := validateReplay(req.Passage, req.Replay); msg != "" {
		return msg
	}
	claimed := req.WPM
	if req.serverResult {
		claimed = -1
	}
	if msg := checkReplayIntegrity(req.Passage, req.Replay, claimed); msg != "" {
		return msg
	}
	if req.Accuracy < 0 || req.Accuracy > 100 {
		return "accuracy out of range"
	}
	if req.RacerCount < 1 || req.RacerCount > maxRacerCount {
		return "racerCount out of range"
	}
	if req.Placement < 1 || req.Placement > req.RacerCount {
		return "placement out of range"
	}
	return ""
}

// handlePostRace serves POST /api/users/me/races — records one just-finished race.
func handlePostRace(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		var req raceRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRaceBodyBytes)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid body")
			return
		}
		req.normalize()
		if !raceModes[req.Mode] {
			writeError(w, http.StatusBadRequest, "unknown mode")
			return
		}

		ctx := r.Context()
		if err := upsertIdentity(ctx, pool, id); err != nil {
			log.Printf("upsertIdentity failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		var dailyDay *time.Time
		if req.Mode == "daily" && req.DailyDate != "" {
			day, err := parseDailyDate(req.DailyDate, time.Now())
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid dailyDate")
				return
			}
			dailyDay = &day
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			log.Printf("begin race tx failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		defer tx.Rollback(ctx) //nolint:errcheck // no-op once Commit succeeds

		// The ticket first: for a multiplayer race it supplies the result that's then checked.
		msg, err := claimTicket(ctx, tx, id.id, &req, time.Now())
		if err != nil {
			log.Printf("claimTicket failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if msg == "" {
			msg = req.validate()
		}
		if msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}
		passage, replay, err := req.replayColumns()
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid replay")
			return
		}

		var result RaceResult
		var createdAt time.Time
		err = tx.QueryRow(ctx, `
			INSERT INTO race_results (user_id, wpm, accuracy, placement, racer_count, mode, passage, replay, local_hour, verified)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
			RETURNING id, mode, wpm, accuracy, placement, racer_count, replay IS NOT NULL, created_at
		`, id.id, req.WPM, req.Accuracy, req.Placement, req.RacerCount, req.Mode, passage, replay, req.LocalHour).
			Scan(&result.ID, &result.Mode, &result.WPM, &result.Accuracy, &result.Placement, &result.RacerCount, &result.HasReplay, &createdAt)
		if err != nil {
			log.Printf("insert race_results failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		result.CoinsEarned = coinsForRace(req)
		if _, err := tx.Exec(ctx, `UPDATE users SET coins = coins + $2 WHERE id = $1`, id.id, result.CoinsEarned); err != nil {
			log.Printf("award coins failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if dailyDay != nil {
			if err := upsertDailyResult(ctx, tx, id.id, *dailyDay, req.WPM, req.Accuracy, &result.ID); err != nil {
				log.Printf("upsert daily_results failed: %s\n", err)
				writeError(w, http.StatusInternalServerError, "internal error")
				return
			}
		}
		result.Achievements, err = syncAchievements(ctx, tx, id.id)
		if err != nil {
			log.Printf("syncAchievements failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if err := tx.Commit(ctx); err != nil {
			log.Printf("commit race tx failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		result.Date = createdAt.Format(time.RFC3339)
		writeJSON(w, http.StatusCreated, result)
	})
}

type importRaceEntry struct {
	raceRequest
	Date string `json:"date"`
}

// handlePostRacesImport serves POST /api/users/me/races/import — a one-shot bulk carry-over of
// whatever race history a browser already had in localStorage (see useProfile.ts) from before
// this user ever logged in, so logging in for the first time doesn't silently discard it.
// Deliberately not idempotent: calling this twice duplicates rows. That's an acceptable trade-off
// for a one-time, non-adversarial UX nicety — the frontend only ever calls it once, tracked by a
// local "already imported" flag — not something worth a dedup mechanism for.
func handlePostRacesImport(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		var entries []importRaceEntry
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxImportBatch*maxRaceBodyBytes)).Decode(&entries); err != nil {
			writeError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if len(entries) > maxImportBatch {
			writeError(w, http.StatusBadRequest, "too many races in one import")
			return
		}
		// Only races that hold up — with a replay that passes the same checks as a live one — are
		// carried over; anything else (an old race saved before replays existed, or a forged one)
		// is left behind rather than failing the whole import. Even those count for the player's own
		// history only: nothing vouches that they ran when and as the browser says (no ticket), so
		// they're stored unverified and stay off the leaderboards.
		kept := entries[:0]
		for i := range entries {
			entries[i].normalize()
			if entries[i].validate() == "" {
				kept = append(kept, entries[i])
			}
		}
		entries = kept

		ctx := r.Context()
		if err := upsertIdentity(ctx, pool, id); err != nil {
			log.Printf("upsertIdentity failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		// One multi-row INSERT rather than N round trips — same batching principle as the
		// crawler's own "one INSERT per page, not per quote" (see quotes-crawler).
		tx, err := pool.Begin(ctx)
		if err != nil {
			log.Printf("begin import tx failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		defer tx.Rollback(ctx) //nolint:errcheck // no-op once Commit succeeds

		for _, e := range entries {
			createdAt := time.Now()
			if parsed, err := time.Parse(time.RFC3339, e.Date); err == nil {
				createdAt = parsed
			}
			passage, replay, err := e.replayColumns()
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid replay")
				return
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO race_results (user_id, wpm, accuracy, placement, racer_count, mode, passage, replay, local_hour, created_at, verified)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE)
			`, id.id, e.WPM, e.Accuracy, e.Placement, e.RacerCount, e.Mode, passage, replay, e.LocalHour, createdAt); err != nil {
				log.Printf("insert imported race failed: %s\n", err)
				writeError(w, http.StatusInternalServerError, "internal error")
				return
			}
		}
		// Races played as a guest pay out on import exactly as they would have live — the guest's
		// own browser-side balance is never trusted, only the races themselves (validated above).
		earned := 0
		for _, e := range entries {
			earned += coinsForRace(e.raceRequest)
		}
		if _, err := tx.Exec(ctx, `UPDATE users SET coins = coins + $2 WHERE id = $1`, id.id, earned); err != nil {
			log.Printf("award import coins failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if _, err := syncAchievements(ctx, tx, id.id); err != nil {
			log.Printf("syncAchievements failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if err := tx.Commit(ctx); err != nil {
			log.Printf("commit import tx failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		profile, err := loadFullProfile(ctx, pool, id.id)
		if err != nil {
			log.Printf("loadFullProfile failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, profile)
	})
}
