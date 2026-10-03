// Command backfill fixes stale word_count data and computes game_unsuitable/unsuitable_reason
// for every existing row in the quotes table — a one-time reconciliation for rows saved before
// dedup.GameSuitability existed (new rows are flagged at insert time by SaveQuote/SaveQuotes
// already; this only needs to run once against the existing corpus, and is safe to re-run any
// time since both steps are idempotent).
//
// Defaults to --dry-run: tallies how many rows would be affected per reason and prints sample
// rows for manual review, without writing anything — the same eyeball-the-real-data method used
// to calibrate GameSuitability's own rules in the first place. Pass -dry-run=false to actually
// write.
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"strings"

	"quotes-crawler/internal/db"
	"quotes-crawler/internal/dedup"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

// batchSize bounds both how many rows are read per SELECT and how many are written per UPDATE —
// same reasoning as redisPipelineChunkSize in internal/db/store.go: keeps each round trip's
// payload bounded regardless of how large the corpus grows, rather than one query spanning the
// whole table.
const batchSize = 5000

// samplesPerReason caps how many example rows --dry-run prints per reason code — enough to
// actually eyeball for false positives, not so many the output is unreadable.
const samplesPerReason = 5

func main() {
	dryRun := flag.Bool("dry-run", true, "tally and print samples without writing (default true — pass -dry-run=false to actually update)")
	flag.Parse()

	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		log.Fatal("Error loading .env file: ", err)
	}

	pool, err := db.ConnectPostgres(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Could not connect to Postgres: ", err)
	}
	defer pool.Close()

	ctx := context.Background()

	log.Println("--- Step 1: word_count reconciliation ---")
	if err := fixWordCounts(ctx, pool, *dryRun); err != nil {
		log.Fatal("word_count reconciliation failed: ", err)
	}

	log.Println("--- Step 2: game_unsuitable / unsuitable_reason backfill ---")
	if err := backfillSuitability(ctx, pool, *dryRun); err != nil {
		log.Fatal("suitability backfill failed: ", err)
	}

	if *dryRun {
		log.Println("Dry run complete — nothing was written. Re-run with -dry-run=false to apply.")
	} else {
		log.Println("Backfill complete.")
	}
}

// fixWordCounts recomputes word_count for every row using the exact formula the original
// migration used, wherever the stored value doesn't match what the text actually contains —
// found live that ~6,901 rows have word_count=0 despite real, often long, text (traced to
// inserts made before the word_count column existed in the INSERT statement, which silently
// took the DEFAULT 0 and were never touched by the one-time migration backfill, since they
// hadn't been inserted yet at the point that ran). Scoped to actual mismatches, not every row
// unconditionally, so a re-run after the first successful one is a fast no-op.
func fixWordCounts(ctx context.Context, pool *pgxpool.Pool, dryRun bool) error {
	if dryRun {
		var mismatched int64
		err := pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM quotes
			 WHERE word_count != array_length(regexp_split_to_array(trim(text), '\s+'), 1)`,
		).Scan(&mismatched)
		if err != nil {
			return err
		}
		log.Printf("Would fix word_count on %d row(s) (dry run — nothing written)", mismatched)
		return nil
	}

	tag, err := pool.Exec(ctx,
		`UPDATE quotes SET word_count = array_length(regexp_split_to_array(trim(text), '\s+'), 1)
		 WHERE word_count != array_length(regexp_split_to_array(trim(text), '\s+'), 1)`,
	)
	if err != nil {
		return err
	}
	log.Printf("Fixed word_count on %d row(s)", tag.RowsAffected())
	return nil
}

type candidateRow struct {
	id   int64
	text string
}

// backfillSuitability paginates the whole quotes table by id (an index range scan, not a full
// table sort — same reasoning as the random-quote query fix elsewhere in this codebase), computes
// dedup.GameSuitability for each row, and either tallies+samples (dry run) or batch-updates
// (real run) rows whose flag actually needs to change. Only rows where the computed suitability
// differs from what's already stored are touched, so a re-run is fast and idempotent.
func backfillSuitability(ctx context.Context, pool *pgxpool.Pool, dryRun bool) error {
	reasonCounts := map[string]int64{}
	samples := map[string][]candidateRow{}
	var totalScanned int64

	var lastID int64
	for {
		rows, err := pool.Query(ctx,
			`SELECT id, text FROM quotes WHERE id > $1 ORDER BY id LIMIT $2`,
			lastID, batchSize,
		)
		if err != nil {
			return err
		}

		var batch []candidateRow
		for rows.Next() {
			var r candidateRow
			if err := rows.Scan(&r.id, &r.text); err != nil {
				rows.Close()
				return err
			}
			batch = append(batch, r)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}
		rows.Close()

		if len(batch) == 0 {
			break
		}
		lastID = batch[len(batch)-1].id
		totalScanned += int64(len(batch))

		var updateIDs []int64
		var updateUnsuitable []bool
		var updateReasons []*string

		for _, r := range batch {
			unsuitable, reasons := dedup.GameSuitability(r.text)
			for _, reason := range reasons {
				reasonCounts[reason]++
				if len(samples[reason]) < samplesPerReason {
					samples[reason] = append(samples[reason], r)
				}
			}

			var reasonStr *string
			if unsuitable {
				joined := strings.Join(reasons, ",")
				reasonStr = &joined
			}

			updateIDs = append(updateIDs, r.id)
			updateUnsuitable = append(updateUnsuitable, unsuitable)
			updateReasons = append(updateReasons, reasonStr)
		}

		if !dryRun && len(updateIDs) > 0 {
			_, err := pool.Exec(ctx,
				`UPDATE quotes AS q
				 SET game_unsuitable = u.game_unsuitable, unsuitable_reason = u.unsuitable_reason
				 FROM unnest($1::bigint[], $2::bool[], $3::text[]) AS u(id, game_unsuitable, unsuitable_reason)
				 WHERE q.id = u.id
				   AND (q.game_unsuitable IS DISTINCT FROM u.game_unsuitable
				        OR q.unsuitable_reason IS DISTINCT FROM u.unsuitable_reason)`,
				updateIDs, updateUnsuitable, updateReasons,
			)
			if err != nil {
				return err
			}
		}

		log.Printf("Scanned %d rows (up to id %d)...", totalScanned, lastID)
	}

	log.Printf("Scanned %d rows total.", totalScanned)
	log.Println("Reason breakdown:")
	for reason, count := range reasonCounts {
		log.Printf("  %s: %d row(s)", reason, count)
	}

	if dryRun {
		for reason, rows := range samples {
			log.Printf("--- samples for %q ---", reason)
			for _, r := range rows {
				log.Printf("  id=%d: %q", r.id, truncate(r.text, 100))
			}
		}
	}

	return nil
}

func truncate(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "..."
}
