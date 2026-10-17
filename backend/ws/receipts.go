package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// A receipt is how a multiplayer result reaches the player's account without trusting the
// browser with it: when a player finishes, this server writes the result it measured into the
// api's race_tickets table (backend/api/tickets.go, which owns the table) and sends the ticket id
// to that player alone. Their browser saves the race against it, and the api takes the WPM,
// placement and racer count from the ticket, not from the browser.
type raceReceipt struct {
	passage    string
	wpm        float64
	placement  int
	racerCount int
}

// receiptTimeout bounds the one insert, so a slow database never holds up a finish for long.
const receiptTimeout = 2 * time.Second

func issueReceiptTo(pool *pgxpool.Pool) func(raceReceipt) (string, error) {
	return func(rc raceReceipt) (string, error) {
		b := make([]byte, 16)
		if _, err := rand.Read(b); err != nil {
			return "", err
		}
		id := hex.EncodeToString(b)
		sum := sha256.Sum256([]byte(rc.passage))
		ctx, cancel := context.WithTimeout(context.Background(), receiptTimeout)
		defer cancel()
		_, err := pool.Exec(ctx, `
			INSERT INTO race_tickets (id, mode, passage_sha, wpm, placement, racer_count)
			VALUES ($1, 'multiplayer', $2, $3, $4, $5)
		`, id, hex.EncodeToString(sum[:]), rc.wpm, rc.placement, rc.racerCount)
		return id, err
	}
}
