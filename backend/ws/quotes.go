package main

import (
	"context"
	"errors"
	"math/rand"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNoEligibleQuote is returned when no quote matches the requested filters — a real,
// expected outcome (an unusual word-count range, a language with a small corpus), not a
// server error.
var ErrNoEligibleQuote = errors.New("no eligible quote found")

// TypingQuote is the shape sent to a typing-race client — only what a typing game actually
// needs (no tags, no hashes, no internal IDs from the quotes table this reads from).
type TypingQuote struct {
	Text     string `json:"text"`
	Author   string `json:"author"`
	Source   string `json:"source"`
	Language string `json:"language"`
}

// RandomTypingQuote returns one random quote matching language and a word-count range
// [minWords, maxWords], excluding exclude (typically the previous race's passage, so
// consecutive races don't repeat it back to back) if it's non-empty. word_count and
// game_unsuitable are precomputed, indexed columns backend/scraper's db.SaveQuote sets at write
// time — filtering on them directly is far cheaper than re-deriving them from text on every
// request. game_unsuitable flags real, correctly-sourced quotes that just aren't a good fit for
// a typing race (too short, unwritable characters, leaked citation/markup — see
// dedup.GameSuitability) — excluded here, not deleted from the corpus. This service, like
// backend/api, only ever reads the quotes table; it never writes to it and never runs
// migrations — that's the scraper's job as the schema's owner (see README).
//
// Kept in sync with backend/api/quotes.go's own RandomTypingQuote by hand — a separate Go
// module, can't share this code directly without a larger restructuring. Same id-range-scan
// approach as that copy, not "ORDER BY random() LIMIT 1": that forces Postgres to evaluate
// random() for every row in the filtered candidate set and sort all of them just to keep the top
// 1 — see backend/api/quotes.go's own doc comment for the full reasoning and live measurements
// (1.5s per call at 752K rows with ORDER BY random(), ~1.25ms with this approach).
func RandomTypingQuote(ctx context.Context, pool *pgxpool.Pool, language string, minWords, maxWords int, exclude string) (TypingQuote, error) {
	var minID, maxID int64
	if err := pool.QueryRow(ctx, `SELECT COALESCE(MIN(id), 0), COALESCE(MAX(id), 0) FROM quotes`).Scan(&minID, &maxID); err != nil {
		return TypingQuote{}, err
	}
	if maxID == 0 {
		return TypingQuote{}, ErrNoEligibleQuote
	}
	randomID := minID + rand.Int63n(maxID-minID+1)

	const selectQuery = `SELECT text, author, source, language
         FROM quotes
         WHERE id >= $1 AND language = $2 AND word_count BETWEEN $3 AND $4 AND text != $5
               AND game_unsuitable = false
         ORDER BY id
         LIMIT 1`

	var q TypingQuote
	err := pool.QueryRow(ctx, selectQuery, randomID, language, minWords, maxWords, exclude).
		Scan(&q.Text, &q.Author, &q.Source, &q.Language)

	if errors.Is(err, pgx.ErrNoRows) {
		// Nothing at or after randomID matched — wrap around to the start of the id range
		// instead of giving up.
		err = pool.QueryRow(ctx, selectQuery, minID, language, minWords, maxWords, exclude).
			Scan(&q.Text, &q.Author, &q.Source, &q.Language)
	}

	if errors.Is(err, pgx.ErrNoRows) {
		return TypingQuote{}, ErrNoEligibleQuote
	}
	if err != nil {
		return TypingQuote{}, err
	}

	q.Text = MakeTypingSafe(q.Text)
	return q, nil
}
