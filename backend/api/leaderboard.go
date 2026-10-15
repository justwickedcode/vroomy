package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const leaderboardSize = 50

// periodHours maps the speed board's ?period= to a rolling window. nil means all time.
var periodHours = map[string]*int{
	"day":  ptr(24),
	"week": ptr(24 * 7),
	"all":  nil,
}

func ptr[T any](v T) *T { return &v }

// LeaderboardEntry is one ranked player. ReplayID points at the race that earned the spot, when
// that race has a replay.
type LeaderboardEntry struct {
	Rank        int    `json:"rank"`
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
	AvatarURL   string `json:"avatarUrl,omitempty"`
	CarModel    string `json:"carModel"`
	WPM         int    `json:"wpm"`
	Accuracy    int    `json:"accuracy"`
	ReplayID    *int64 `json:"replayId"`
	IsMe        bool   `json:"isMe"`
}

// Leaderboard is the GET /api/leaderboards response. Me is the caller's own row when they're
// ranked but outside the top leaderboardSize, so the page can always show "you're #312".
type Leaderboard struct {
	Entries []LeaderboardEntry `json:"entries"`
	Me      *LeaderboardEntry  `json:"me"`
}

// scopeFilter restricts a board to the caller and their accepted friends when $2 is a user id,
// and is a no-op when $2 is NULL (the global board). col is the user-id column being filtered.
func scopeFilter(col string) string {
	return `($2::text IS NULL OR ` + col + ` = $2 OR ` + col + ` IN (
		SELECT CASE WHEN requester_id = $2 THEN addressee_id ELSE requester_id END
		FROM friendships
		WHERE status = 'accepted' AND (requester_id = $2 OR addressee_id = $2)
	))`
}

// Both boards rank with RANK() so tied players share a place, and select the top
// leaderboardSize plus the caller's own row ($3) wherever it falls.
var (
	speedBoardQuery = `
		WITH best AS (
			SELECT DISTINCT ON (r.user_id)
				r.user_id, r.id, r.wpm, r.accuracy, r.replay IS NOT NULL AS has_replay
			FROM race_results r
			WHERE ($1::int IS NULL OR r.created_at >= NOW() - make_interval(hours => $1::int))
				AND ` + scopeFilter("r.user_id") + `
			ORDER BY r.user_id, r.wpm DESC, r.accuracy DESC, r.created_at
		), ranked AS (
			SELECT best.*, RANK() OVER (ORDER BY wpm DESC, accuracy DESC)::int AS rank FROM best
		)
		SELECT ranked.rank, u.id, u.display_name, COALESCE(u.avatar_url, ''), u.car_model,
		       ranked.wpm, ranked.accuracy, CASE WHEN ranked.has_replay THEN ranked.id END
		FROM ranked JOIN users u ON u.id = ranked.user_id
		WHERE ranked.rank <= $4 OR ranked.user_id = $3
		ORDER BY ranked.rank, LOWER(u.display_name)`

	dailyBoardQuery = `
		WITH ranked AS (
			SELECT d.user_id, d.wpm, d.accuracy, d.race_id,
			       RANK() OVER (ORDER BY d.wpm DESC, d.accuracy DESC)::int AS rank
			FROM daily_results d
			WHERE d.day = $1::date AND ` + scopeFilter("d.user_id") + `
		)
		SELECT ranked.rank, u.id, u.display_name, COALESCE(u.avatar_url, ''), u.car_model,
		       ranked.wpm, ranked.accuracy,
		       (SELECT r.id FROM race_results r WHERE r.id = ranked.race_id AND r.replay IS NOT NULL)
		FROM ranked JOIN users u ON u.id = ranked.user_id
		WHERE ranked.rank <= $4 OR ranked.user_id = $3
		ORDER BY ranked.rank, LOWER(u.display_name)`
)

func queryLeaderboard(ctx context.Context, pool *pgxpool.Pool, query string, filter any, scopeUser *string, me string) (Leaderboard, error) {
	rows, err := pool.Query(ctx, query, filter, scopeUser, me, leaderboardSize)
	if err != nil {
		return Leaderboard{}, err
	}
	entries, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (LeaderboardEntry, error) {
		var e LeaderboardEntry
		err := row.Scan(&e.Rank, &e.UserID, &e.DisplayName, &e.AvatarURL, &e.CarModel, &e.WPM, &e.Accuracy, &e.ReplayID)
		e.IsMe = me != "" && e.UserID == me
		return e, err
	})
	if err != nil {
		return Leaderboard{}, err
	}

	board := Leaderboard{Entries: []LeaderboardEntry{}}
	for _, e := range entries {
		if e.Rank > leaderboardSize {
			board.Me = &e
			continue
		}
		board.Entries = append(board.Entries, e)
	}
	return board, nil
}

// handleLeaderboard serves GET /api/leaderboards?board=speed|daily&period=day|week|all&
// scope=global|friends&date=YYYY-MM-DD.
//
//   - board=speed (default) ranks each player's single best race inside period (rolling 24h,
//     7 days, or all time).
//   - board=daily ranks that day's daily-challenge results; date is the player's local date,
//     validated the same way as GET /api/quotes/daily.
//   - scope=friends limits either board to the caller and their accepted friends, and is the
//     one option that requires an identity. The global board works for logged-out visitors too;
//     a logged-in caller additionally gets their own rows flagged.
func handleLeaderboard(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		me := r.Header.Get(headerUserID)

		var scopeUser *string
		switch query.Get("scope") {
		case "", "global":
		case "friends":
			if me == "" {
				writeError(w, http.StatusUnauthorized, "log in to see the friends leaderboard")
				return
			}
			scopeUser = &me
		default:
			writeError(w, http.StatusBadRequest, "invalid scope")
			return
		}

		var (
			board Leaderboard
			err   error
		)
		switch query.Get("board") {
		case "", "speed":
			period := query.Get("period")
			if period == "" {
				period = "week"
			}
			hours, ok := periodHours[period]
			if !ok {
				writeError(w, http.StatusBadRequest, "invalid period")
				return
			}
			board, err = queryLeaderboard(r.Context(), pool, speedBoardQuery, hours, scopeUser, me)
		case "daily":
			day, dateErr := parseDailyDate(query.Get("date"), time.Now())
			if dateErr != nil {
				writeError(w, http.StatusBadRequest, "invalid date")
				return
			}
			board, err = queryLeaderboard(r.Context(), pool, dailyBoardQuery, day.Format(dailyDateLayout), scopeUser, me)
		default:
			writeError(w, http.StatusBadRequest, "invalid board")
			return
		}

		if err != nil {
			log.Printf("leaderboard query failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, board)
	}
}
