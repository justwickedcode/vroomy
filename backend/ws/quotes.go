package main

import (
	"context"
	"errors"

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
// consecutive races don't repeat it back to back) if it's non-empty. word_count is a
// precomputed, indexed column backend/scraper's db.SaveQuote sets at write time — filtering on
// it directly is far cheaper than re-splitting every candidate row's text on every request.
// This service, like backend/api, only ever reads the quotes table; it never writes to it and
// never runs migrations — that's the scraper's job as the schema's owner (see README).
func RandomTypingQuote(ctx context.Context, pool *pgxpool.Pool, language string, minWords, maxWords int, exclude string) (TypingQuote, error) {
	var q TypingQuote
	err := pool.QueryRow(ctx,
		`SELECT text, author, source, language
         FROM quotes
         WHERE language = $1 AND word_count BETWEEN $2 AND $3 AND text != $4
         ORDER BY random()
         LIMIT 1`,
		language, minWords, maxWords, exclude,
	).Scan(&q.Text, &q.Author, &q.Source, &q.Language)
	if errors.Is(err, pgx.ErrNoRows) {
		return TypingQuote{}, ErrNoEligibleQuote
	}
	if err != nil {
		return TypingQuote{}, err
	}

	q.Text = MakeTypingSafe(q.Text)
	return q, nil
}
