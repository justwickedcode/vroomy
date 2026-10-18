package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// A 60-word passage is ~350 characters; even counting every rejected keystroke and
	// backspace, a real run stays well under these. They only bound what a hostile client can
	// make the database store.
	maxPassageLen   = 2000
	maxReplayEvents = 6000
	maxReplayMs     = 10 * 60 * 1000
)

// replayEvent is one moment in a race: [msSinceStart, typedLength, rejected]. The game only
// ever accepts correct characters (see the frontend's useTypingRace), so what the player had
// typed at any moment is exactly passage[:typedLength] — storing the length instead of the text
// keeps a whole replay to a few KB. rejected is 1 for a keystroke the game refused (a typo),
// which the player uses to flash the error the same way the live race did.
type replayEvent [3]int

// validateReplay checks a replay is internally consistent with its passage: timestamps never go
// backwards, lengths stay inside the passage, and the run actually reaches the end. It doesn't
// prove the run was typed by a human — nothing client-side can — but it stops garbage from being
// stored and played back.
func validateReplay(passage string, events []replayEvent) string {
	if passage == "" {
		return "replay requires a passage"
	}
	if len(passage) > maxPassageLen {
		return "passage too long"
	}
	if len(events) == 0 || len(events) > maxReplayEvents {
		return "replay event count out of range"
	}
	last := -1
	for _, e := range events {
		t, length, rejected := e[0], e[1], e[2]
		if t < last || t < 0 || t > maxReplayMs {
			return "replay timestamps out of order"
		}
		if length < 0 || length > len(passage) {
			return "replay length out of range"
		}
		if rejected != 0 && rejected != 1 {
			return "replay rejected flag must be 0 or 1"
		}
		last = t
	}
	if events[len(events)-1][1] != len(passage) {
		return "replay does not finish the passage"
	}
	return ""
}

// Replay is the GET /api/replays/{id} response.
type Replay struct {
	ID          int64         `json:"id"`
	Date        string        `json:"date"`
	Mode        string        `json:"mode"`
	WPM         int           `json:"wpm"`
	Accuracy    int           `json:"accuracy"`
	Placement   int           `json:"placement"`
	RacerCount  int           `json:"racerCount"`
	Passage     string        `json:"passage"`
	Events      []replayEvent `json:"events"`
	DisplayName string        `json:"displayName"`
	AvatarURL   string        `json:"avatarUrl,omitempty"`
	CarLook
}

// handleGetReplay serves GET /api/replays/{id}. Public on purpose: leaderboard rows link to the
// replay of each player's best run, and a replay reveals nothing a leaderboard row doesn't
// already show (display name, car, WPM) beyond the keystroke timing itself.
func handleGetReplay(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || id <= 0 {
			writeError(w, http.StatusBadRequest, "invalid replay id")
			return
		}

		var rep Replay
		var createdAt time.Time
		var rawEvents []byte
		err = pool.QueryRow(r.Context(), `
			SELECT r.id, r.created_at, r.mode, r.wpm, r.accuracy, r.placement, r.racer_count,
			       r.passage, r.replay, u.display_name, COALESCE(u.avatar_url, ''),
			       `+carLookColumns+`
			FROM race_results r
			JOIN users u ON u.id = r.user_id
			WHERE r.id = $1 AND r.replay IS NOT NULL
		`, id).Scan(&rep.ID, &createdAt, &rep.Mode, &rep.WPM, &rep.Accuracy, &rep.Placement,
			&rep.RacerCount, &rep.Passage, &rawEvents, &rep.DisplayName, &rep.AvatarURL, &rep.CarModel,
			&rep.Underglow, &rep.UnderglowColor, &rep.Trail)
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "replay not found")
			return
		}
		if err != nil {
			log.Printf("load replay failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if err := json.Unmarshal(rawEvents, &rep.Events); err != nil {
			log.Printf("decode replay %d failed: %s\n", id, err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		rep.Date = createdAt.Format(time.RFC3339)
		writeJSON(w, http.StatusOK, rep)
	}
}
