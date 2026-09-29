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
// server error, so callers can map it to a 404 rather than a 500.
var ErrNoEligibleQuote = errors.New("no eligible quote found")

// TypingQuote is the shape returned to a typing-race client — only what a typing game
// actually needs (no tags, no hashes, no internal IDs from the quotes table this reads from).
type TypingQuote struct {
	Text     string `json:"text"`
	Author   string `json:"author"`
	Source   string `json:"source"`
	Language string `json:"language"`
}

// RandomTypingQuote returns one random quote matching language and a word-count range
// [minWords, maxWords], excluding exclude (typically the sentence the client was just shown,
// so consecutive races don't repeat the same passage back to back) if it's non-empty.
// word_count and game_unsuitable are precomputed, indexed columns the scraper (backend/scraper)
// sets at write time — filtering on them directly is far cheaper than re-deriving them from text
// on every request. game_unsuitable flags real, correctly-sourced quotes that just aren't a good
// fit for a typing race (too short, unwritable characters, leaked citation/markup — see
// dedup.GameSuitability) — excluded here, not deleted from the corpus, since some other future
// consumer might still want them. This API only ever reads the quotes table; it never writes to
// it and never runs migrations — that's the scraper's job as the schema's owner (see README).
//
// Deliberately not "ORDER BY random() LIMIT 1": that forces Postgres to evaluate random() for
// every row in the filtered candidate set and sort all of them just to keep the top 1 — an
// O(N log N) full-set sort on this API's one public endpoint, on every single request. Fine at
// today's corpus size, but the crawler this API reads from is explicitly designed to grow into
// the hundreds of thousands of rows (Goodreads' own sitemap alone lists ~5.5M quote URLs — see
// backend/scraper/README.md), at which point that sort becomes real, measurable cost paid by
// every typing-race request. Instead: pick a random starting id (from the table's live min/max,
// so it always tracks the crawler's growing corpus with no cache to invalidate) and scan forward
// from there for the first row matching the filters — an index range scan on the primary key,
// O(log N) to find the start plus a short forward scan, not a sort of the whole candidate set.
// Wraps around to the very beginning if nothing matches going forward (e.g. a narrow word-count
// range whose matches all happen to sit before the random starting point).
//
// Trade-off, deliberately accepted: not perfectly uniform — a row right after an id gap (a
// skipped ON CONFLICT insert) is marginally more likely to be picked than one in a dense run of
// consecutive ids, since it "absorbs" every random starting point landing in that gap. No player
// in a typing race could ever notice that skew; it's the standard accepted cost of avoiding a
// full-table sort for this exact problem.
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
