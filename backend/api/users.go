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
	WPM        int    `json:"wpm"`
	Accuracy   int    `json:"accuracy"`
	Placement  int    `json:"placement"`
	RacerCount int    `json:"racerCount"`
}

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
}

func loadUserRow(ctx context.Context, pool *pgxpool.Pool, userID string) (userRow, error) {
	var row userRow
	err := pool.QueryRow(ctx, `
		SELECT display_name, email, avatar_url, car_model, underglow, underglow_color, trail, equipped_powerup
		FROM users WHERE id = $1
	`, userID).Scan(&row.displayName, &row.email, &row.avatarURL, &row.carModel, &row.underglow, &row.underglowColor, &row.trail, &row.equippedPowerup)
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
		SELECT id, wpm, accuracy, placement, racer_count, created_at
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
		if err := rows.Scan(&r.ID, &r.WPM, &r.Accuracy, &r.Placement, &r.RacerCount, &createdAt); err != nil {
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

// handlePutCosmetics serves PUT /api/users/me/cosmetics. Field values aren't checked against
// frontend's own allowed sets (frontend/src/lib/trails.ts, powerups.ts) — the frontend's own UI
// already only ever offers valid choices, and duplicating that allowlist here would just be two
// places to keep in sync. Only length-capped, not value-validated, same spirit as truncate above.
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
	WPM        int `json:"wpm"`
	Accuracy   int `json:"accuracy"`
	Placement  int `json:"placement"`
	RacerCount int `json:"racerCount"`
}

func (req raceRequest) validate() string {
	if req.WPM < 0 || req.WPM > maxWPM {
		return "wpm out of range"
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
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if msg := req.validate(); msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}

		ctx := r.Context()
		if err := upsertIdentity(ctx, pool, id); err != nil {
			log.Printf("upsertIdentity failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		var result RaceResult
		var createdAt time.Time
		err := pool.QueryRow(ctx, `
			INSERT INTO race_results (user_id, wpm, accuracy, placement, racer_count)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id, wpm, accuracy, placement, racer_count, created_at
		`, id.id, req.WPM, req.Accuracy, req.Placement, req.RacerCount).
			Scan(&result.ID, &result.WPM, &result.Accuracy, &result.Placement, &result.RacerCount, &createdAt)
		if err != nil {
			log.Printf("insert race_results failed: %s\n", err)
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
		if err := json.NewDecoder(r.Body).Decode(&entries); err != nil {
			writeError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if len(entries) > maxImportBatch {
			writeError(w, http.StatusBadRequest, "too many races in one import")
			return
		}
		for _, e := range entries {
			if msg := e.validate(); msg != "" {
				writeError(w, http.StatusBadRequest, "race entry: "+msg)
				return
			}
		}

		ctx := r.Context()
		if err := upsertIdentity(ctx, pool, id); err != nil {
			log.Printf("upsertIdentity failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		// One multi-row INSERT rather than N round trips — same batching principle as the
		// crawler's own "one INSERT per page, not per quote" (see backend/scraper).
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
			if _, err := tx.Exec(ctx, `
				INSERT INTO race_results (user_id, wpm, accuracy, placement, racer_count, created_at)
				VALUES ($1, $2, $3, $4, $5, $6)
			`, id.id, e.WPM, e.Accuracy, e.Placement, e.RacerCount, createdAt); err != nil {
				log.Printf("insert imported race failed: %s\n", err)
				writeError(w, http.StatusInternalServerError, "internal error")
				return
			}
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
