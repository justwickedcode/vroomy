package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const dailyDateLayout = "2006-01-02"

// DailyQuote is the GET /api/quotes/daily response: a TypingQuote plus the day it belongs to.
type DailyQuote struct {
	TypingQuote
	Date string `json:"date"`
}

// errDateOutOfRange rejects any day that isn't "today" somewhere on Earth right now — keeps
// players from peeking at (and pre-generating) tomorrow's passage, and keeps the table from
// being filled with arbitrary dates by a script.
var errDateOutOfRange = errors.New("date out of range")

// parseDailyDate accepts the client's own local calendar date, so the challenge rolls over at
// the player's midnight rather than the server's. Every timezone's local date is within one
// day of UTC (UTC-12 to UTC+14), so anything further out than that can't be anyone's today.
func parseDailyDate(raw string, now time.Time) (time.Time, error) {
	todayUTC := now.UTC().Truncate(24 * time.Hour)
	if raw == "" {
		return todayUTC, nil
	}
	day, err := time.Parse(dailyDateLayout, raw)
	if err != nil {
		return time.Time{}, err
	}
	if diff := day.Sub(todayUTC); diff < -24*time.Hour || diff > 24*time.Hour {
		return time.Time{}, errDateOutOfRange
	}
	return day, nil
}

// DailyTypingQuote returns day's passage, picking and freezing one from the live corpus on the
// first request for that day. Concurrent first requests race safely: each may pick a different
// candidate, but ON CONFLICT DO NOTHING lets exactly one insert win, and every caller then
// reads back that same winning row.
func DailyTypingQuote(ctx context.Context, pool *pgxpool.Pool, day time.Time) (DailyQuote, error) {
	q, err := loadDailyQuote(ctx, pool, day)
	if !errors.Is(err, pgx.ErrNoRows) {
		return q, err
	}

	candidate, err := RandomTypingQuote(ctx, pool, "en", defaultMinWords, defaultMaxWords, "")
	if err != nil {
		return DailyQuote{}, err
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO daily_quotes (day, text, author, source, language)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (day) DO NOTHING
	`, day, candidate.Text, candidate.Author, candidate.Source, candidate.Language); err != nil {
		return DailyQuote{}, err
	}
	return loadDailyQuote(ctx, pool, day)
}

func loadDailyQuote(ctx context.Context, pool *pgxpool.Pool, day time.Time) (DailyQuote, error) {
	var q DailyQuote
	var stored time.Time
	err := pool.QueryRow(ctx, `
		SELECT day, text, author, source, language FROM daily_quotes WHERE day = $1
	`, day).Scan(&stored, &q.Text, &q.Author, &q.Source, &q.Language)
	q.Date = stored.Format(dailyDateLayout)
	return q, err
}

// handleDailyQuote serves GET /api/quotes/daily?date=YYYY-MM-DD (date optional, defaults to
// today in UTC).
func handleDailyQuote(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		day, err := parseDailyDate(r.URL.Query().Get("date"), time.Now())
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid date")
			return
		}

		quote, err := DailyTypingQuote(r.Context(), pool, day)
		if errors.Is(err, ErrNoEligibleQuote) {
			writeError(w, http.StatusNotFound, "no quote available for the daily challenge")
			return
		}
		if err != nil {
			log.Printf("DailyTypingQuote failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		writeJSON(w, http.StatusOK, quote)
	}
}

// dbExecutor is satisfied by both *pgxpool.Pool and pgx.Tx, so the daily upsert can run inside
// handlePostRace's transaction or on its own during an import.
type dbExecutor interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// upsertDailyResult records a daily-challenge run, keeping only the player's best for that day
// ("your best attempt each day counts"). A worse retry is a no-op. raceID links the result to
// the race (and its replay) that set it; nil for imported results that have no race behind them.
func upsertDailyResult(ctx context.Context, db dbExecutor, userID string, day time.Time, wpm, accuracy int, raceID *int64) error {
	_, err := db.Exec(ctx, `
		INSERT INTO daily_results (user_id, day, wpm, accuracy, race_id)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id, day) DO UPDATE SET
			wpm = excluded.wpm,
			accuracy = excluded.accuracy,
			race_id = excluded.race_id,
			updated_at = NOW()
		WHERE excluded.wpm > daily_results.wpm
	`, userID, day, wpm, accuracy, raceID)
	return err
}

// DailyResult is one day's best run, as returned to the player.
type DailyResult struct {
	Date     string `json:"date"`
	WPM      int    `json:"wpm"`
	Accuracy int    `json:"accuracy"`
}

// dailyHistoryLimit bounds GET /api/users/me/daily. Two months is enough for any streak the
// page shows and for the history list.
const dailyHistoryLimit = 60

func listDailyResults(ctx context.Context, pool *pgxpool.Pool, userID string) ([]DailyResult, error) {
	rows, err := pool.Query(ctx, `
		SELECT day, wpm, accuracy FROM daily_results
		WHERE user_id = $1
		ORDER BY day DESC
		LIMIT $2
	`, userID, dailyHistoryLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := []DailyResult{}
	for rows.Next() {
		var d DailyResult
		var day time.Time
		if err := rows.Scan(&day, &d.WPM, &d.Accuracy); err != nil {
			return nil, err
		}
		d.Date = day.Format(dailyDateLayout)
		results = append(results, d)
	}
	return results, rows.Err()
}

// handleGetMyDaily serves GET /api/users/me/daily: the player's recent daily-challenge results,
// newest first. Streaks are computed client-side from this, since "today" is the player's local
// date.
func handleGetMyDaily(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		results, err := listDailyResults(r.Context(), pool, id.id)
		if err != nil {
			log.Printf("listDailyResults failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, results)
	})
}

// handleImportDaily serves POST /api/users/me/daily/import — the daily-challenge counterpart of
// races/import: carries a guest's localStorage daily history over on first login. Unlike race
// import this one is idempotent, since the upsert keeps the best result per day.
func handleImportDaily(pool *pgxpool.Pool) http.HandlerFunc {
	return withIdentity(func(w http.ResponseWriter, r *http.Request, id identity) {
		var entries []DailyResult
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&entries); err != nil {
			writeError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if len(entries) > dailyHistoryLimit {
			writeError(w, http.StatusBadRequest, "too many results in one import")
			return
		}

		latest := time.Now().UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
		days := make([]time.Time, len(entries))
		for i, e := range entries {
			day, err := time.Parse(dailyDateLayout, e.Date)
			if err != nil || day.After(latest) {
				writeError(w, http.StatusBadRequest, "invalid date")
				return
			}
			if e.WPM < 0 || e.WPM > maxWPM || e.Accuracy < 0 || e.Accuracy > 100 {
				writeError(w, http.StatusBadRequest, "result out of range")
				return
			}
			days[i] = day
		}

		ctx := r.Context()
		if err := upsertIdentity(ctx, pool, id); err != nil {
			log.Printf("upsertIdentity failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		for i, e := range entries {
			if err := upsertDailyResult(ctx, pool, id.id, days[i], e.WPM, e.Accuracy, nil); err != nil {
				log.Printf("import daily result failed: %s\n", err)
				writeError(w, http.StatusInternalServerError, "internal error")
				return
			}
		}

		results, err := listDailyResults(ctx, pool, id.id)
		if err != nil {
			log.Printf("listDailyResults failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, http.StatusOK, results)
	})
}
