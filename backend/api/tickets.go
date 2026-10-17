package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Race tickets: a replay can be made to look human, but it can't be made to have happened
// before the server knew about it. Before a solo or daily race starts, the player's browser asks
// for a ticket for that passage; the race is then saved against it, once, and no sooner than
// the replay says the race took. A multiplayer race's ticket is written by the ws server itself
// when the player finishes, carrying the result it measured — so that result, not the browser's,
// is what's saved.
const (
	// ticketMaxAge: a ticket is good for this long after it's issued — far longer than any race,
	// so a player can sit on the start screen as long as they like.
	ticketMaxAge = 2 * time.Hour
	// ticketClockSlack: how much earlier than the replay's own length a race may be saved, for
	// clock differences between browser and server.
	ticketClockSlack = 2 * time.Second
	// ticketRetention: unclaimed tickets are swept after this long.
	ticketRetention = 24 * time.Hour
)

// ticketModes are the races a browser may ask a ticket for; multiplayer tickets only ever come
// from the ws server.
var ticketModes = map[string]bool{"solo": true, "daily": true}

func passageSHA(passage string) string {
	sum := sha256.Sum256([]byte(passage))
	return hex.EncodeToString(sum[:])
}

func newTicketID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

type ticketRequest struct {
	Mode      string `json:"mode"`
	Passage   string `json:"passage"`
	DailyDate string `json:"dailyDate"`
}

// handlePostRaceTicket serves POST /api/users/me/race-tickets: {mode, passage, dailyDate} →
// {ticket}. A daily ticket is only issued for that day's actual passage.
func handlePostRaceTicket(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		var req ticketRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if !ticketModes[req.Mode] {
			writeError(w, http.StatusBadRequest, "unknown mode")
			return
		}
		if req.Passage == "" || len(req.Passage) > maxPassageLen {
			writeError(w, http.StatusBadRequest, "invalid passage")
			return
		}

		ctx := r.Context()
		var dailyDay *time.Time
		if req.Mode == "daily" {
			day, err := parseDailyDate(req.DailyDate, time.Now())
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid dailyDate")
				return
			}
			quote, err := loadDailyQuote(ctx, pool, day)
			if err != nil || quote.Text != req.Passage {
				writeError(w, http.StatusBadRequest, "that isn't today's passage")
				return
			}
			dailyDay = &day
		}

		if err := upsertIdentity(ctx, pool, id); err != nil {
			log.Printf("upsertIdentity failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		ticket, err := newTicketID()
		if err != nil {
			log.Printf("newTicketID failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO race_tickets (id, user_id, mode, passage_sha, daily_day)
			VALUES ($1, $2, $3, $4, $5)
		`, ticket, id.id, req.Mode, passageSHA(req.Passage), dailyDay); err != nil {
			log.Printf("insert race_tickets failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"ticket": ticket})
	})
}

// raceTicket is one race_tickets row.
type raceTicket struct {
	userID     *string
	mode       string
	passageSHA string
	dailyDay   *time.Time
	wpm        *float32
	placement  *int16
	racerCount *int16
	// age is how long ago it was issued, by the database's clock (which issued it).
	age    time.Duration
	usedAt *time.Time
}

var errNoTicket = errors.New("no such ticket")

// claimTicket checks req against its ticket and marks the ticket used, inside tx. It returns why
// the race doesn't match its ticket ("" if it does). For a multiplayer race, req's result is
// replaced with the one the ws server measured.
func claimTicket(ctx context.Context, tx pgx.Tx, userID string, req *raceRequest, now time.Time) (string, error) {
	if req.Ticket == "" {
		return "race ticket required", nil
	}
	var t raceTicket
	var ageSeconds float64
	err := tx.QueryRow(ctx, `
		SELECT user_id, mode, passage_sha, daily_day, wpm, placement, racer_count,
		       EXTRACT(EPOCH FROM NOW() - issued_at)::float8, used_at
		FROM race_tickets WHERE id = $1 FOR UPDATE
	`, req.Ticket).Scan(&t.userID, &t.mode, &t.passageSHA, &t.dailyDay, &t.wpm, &t.placement,
		&t.racerCount, &ageSeconds, &t.usedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return "unknown race ticket", nil
	}
	if err != nil {
		return "", err
	}
	t.age = time.Duration(ageSeconds * float64(time.Second))
	if msg := t.check(userID, req, now); msg != "" {
		return msg, nil
	}
	if t.mode == "multiplayer" {
		req.WPM = int(*t.wpm + 0.5)
		req.Placement = int(*t.placement)
		req.RacerCount = int(*t.racerCount)
		req.serverResult = true
	}
	_, err = tx.Exec(ctx, `UPDATE race_tickets SET used_at = NOW() WHERE id = $1`, req.Ticket)
	return "", err
}

// check is claimTicket's verdict, apart from the database.
func (t raceTicket) check(userID string, req *raceRequest, now time.Time) string {
	if t.userID != nil && *t.userID != userID {
		return "unknown race ticket"
	}
	if t.usedAt != nil {
		return "race ticket already used"
	}
	if t.age > ticketMaxAge {
		return "race ticket expired"
	}
	if t.mode != req.Mode {
		return "race ticket is for another mode"
	}
	if t.passageSHA != passageSHA(req.Passage) {
		return "race ticket is for another passage"
	}
	if t.mode == "multiplayer" {
		if t.wpm == nil || t.placement == nil || t.racerCount == nil {
			return "race ticket has no result"
		}
		return ""
	}
	// A race can't have taken longer than the time since its ticket was issued.
	if len(req.Replay) > 0 {
		took := time.Duration(req.Replay[len(req.Replay)-1][0]) * time.Millisecond
		if t.age+ticketClockSlack < took {
			return "race finished before it could have"
		}
	}
	if t.dailyDay != nil {
		day, err := parseDailyDate(req.DailyDate, now)
		if err != nil || !day.Equal(*t.dailyDay) {
			return "race ticket is for another day"
		}
	}
	return ""
}

// sweepTickets deletes tickets nobody claimed, every so often, for the life of the process.
func sweepTickets(ctx context.Context, pool *pgxpool.Pool) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		if _, err := pool.Exec(ctx, `DELETE FROM race_tickets WHERE issued_at < NOW() - make_interval(secs => $1)`,
			ticketRetention.Seconds()); err != nil && ctx.Err() == nil {
			log.Printf("sweep race_tickets failed: %s\n", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
