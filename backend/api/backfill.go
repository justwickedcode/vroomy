package main

import (
	"context"
	"encoding/json"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// backfillBatch is how many unchecked races are re-checked per round trip.
const backfillBatch = 200

// backfillVerification settles every race from before race tickets (verified IS NULL): one whose
// stored replay still passes the anti-cheat checks is verified and keeps its leaderboard spot;
// one without a replay, or whose replay doesn't hold up, isn't. Then daily results that lost their
// link to a race (imported ones) are matched back up with a verified daily race of the same day
// and speed, where there is one. Safe to run on every start: once settled, nothing's left to do.
func backfillVerification(ctx context.Context, pool *pgxpool.Pool) error {
	checked, passed := 0, 0
	for {
		rows, err := pool.Query(ctx, `
			SELECT id, wpm, COALESCE(passage, ''), replay
			FROM race_results WHERE verified IS NULL
			ORDER BY id LIMIT $1
		`, backfillBatch)
		if err != nil {
			return err
		}
		type verdict struct {
			id int64
			ok bool
		}
		verdicts, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (verdict, error) {
			var (
				id      int64
				wpm     int
				passage string
				raw     []byte
			)
			if err := row.Scan(&id, &wpm, &passage, &raw); err != nil {
				return verdict{}, err
			}
			return verdict{id: id, ok: storedRaceHoldsUp(wpm, passage, raw)}, nil
		})
		if err != nil {
			return err
		}
		if len(verdicts) == 0 {
			break
		}
		batch := &pgx.Batch{}
		for _, v := range verdicts {
			batch.Queue(`UPDATE race_results SET verified = $2 WHERE id = $1`, v.id, v.ok)
			checked++
			if v.ok {
				passed++
			}
		}
		if err := pool.SendBatch(ctx, batch).Close(); err != nil {
			return err
		}
	}
	if checked > 0 {
		log.Printf("re-checked %d races from before race tickets: %d verified\n", checked, passed)
	}

	tag, err := pool.Exec(ctx, `
		UPDATE daily_results d SET race_id = (
			SELECT r.id FROM race_results r
			WHERE r.user_id = d.user_id AND r.mode = 'daily' AND r.verified AND r.wpm = d.wpm
				AND r.created_at BETWEEN d.day - INTERVAL '1 day' AND d.day + INTERVAL '2 days'
			ORDER BY r.created_at LIMIT 1
		)
		WHERE d.race_id IS NULL AND EXISTS (
			SELECT 1 FROM race_results r
			WHERE r.user_id = d.user_id AND r.mode = 'daily' AND r.verified AND r.wpm = d.wpm
				AND r.created_at BETWEEN d.day - INTERVAL '1 day' AND d.day + INTERVAL '2 days'
		)
	`)
	if err != nil {
		return err
	}
	if n := tag.RowsAffected(); n > 0 {
		log.Printf("linked %d daily results back to their verified races\n", n)
	}
	return nil
}

// storedRaceHoldsUp runs a stored race through the same checks a new one gets (minus its ticket,
// which races from before tickets never had).
func storedRaceHoldsUp(wpm int, passage string, raw []byte) bool {
	if raw == nil {
		return false
	}
	var events []replayEvent
	if err := json.Unmarshal(raw, &events); err != nil {
		return false
	}
	if validateReplay(passage, events) != "" {
		return false
	}
	return checkReplayIntegrity(passage, events, wpm) == ""
}
