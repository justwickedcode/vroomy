package main

import (
	"context"
	_ "embed"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// achievementRewardsJSON is how many coins each achievement pays, once. The frontend shows the
// same numbers from an identical copy (frontend/src/lib/shop/achievement_rewards.json);
// TestAchievementRewardsMatchFrontend fails if they drift apart.
//
//go:embed achievement_rewards.json
var achievementRewardsJSON []byte

var achievementRewards = mustLoadPrices(achievementRewardsJSON)

// raceFacts is everything the achievement rules look at, read from a player's full race history
// in two queries (see loadRaceFacts).
type raceFacts struct {
	racesPlayed  int
	bestWPM      int
	avgAccuracy  int
	wins         int
	anyPerfect   bool // a race at 100% accuracy
	anyPodium    bool // placed 1st-3rd
	giantSlayer  bool // won against at least 4 others
	anyBefore7am bool
	anyBefore4am bool
	lastThree    []recentRace // newest first
}

type recentRace struct {
	accuracy  int
	placement int
}

// achievementRules mirrors frontend/src/lib/achievements.ts's ACHIEVEMENTS, rule for rule, by id.
// The frontend uses its copy to show progress; this one decides what actually pays.
var achievementRules = map[string]func(f raceFacts) bool{
	"first-lap":         func(f raceFacts) bool { return f.racesPlayed >= 1 },
	"getting-warmed-up": func(f raceFacts) bool { return f.bestWPM >= 30 },
	"speed-demon":       func(f raceFacts) bool { return f.bestWPM >= 60 },
	"highway-cruiser":   func(f raceFacts) bool { return f.bestWPM >= 80 },
	"century-club":      func(f raceFacts) bool { return f.bestWPM >= 100 },
	"turbocharged":      func(f raceFacts) bool { return f.bestWPM >= 120 },
	"nitro-boost":       func(f raceFacts) bool { return f.bestWPM >= 150 },
	"ludicrous-speed":   func(f raceFacts) bool { return f.bestWPM >= 200 },

	"marathoner":   func(f raceFacts) bool { return f.racesPlayed >= 10 },
	"road-warrior": func(f raceFacts) bool { return f.racesPlayed >= 25 },
	"daily-driver": func(f raceFacts) bool { return f.racesPlayed >= 50 },
	"long-hauler":  func(f raceFacts) bool { return f.racesPlayed >= 100 },
	"odometer":     func(f raceFacts) bool { return f.racesPlayed >= 250 },

	"sharpshooter": func(f raceFacts) bool { return f.anyPerfect },
	"steady-hands": func(f raceFacts) bool { return f.racesPlayed >= 5 && f.avgAccuracy >= 95 },
	"flawless-streak": func(f raceFacts) bool {
		return lastThreeAll(f, func(r recentRace) bool { return r.accuracy == 100 })
	},

	"on-the-podium":  func(f raceFacts) bool { return f.anyPodium },
	"checkered-flag": func(f raceFacts) bool { return f.wins >= 1 },
	"hat-trick":      func(f raceFacts) bool { return f.wins >= 3 },
	"giant-slayer":   func(f raceFacts) bool { return f.giantSlayer },
	"win-streak": func(f raceFacts) bool {
		return lastThreeAll(f, func(r recentRace) bool { return r.placement == 1 })
	},

	"early-bird": func(f raceFacts) bool { return f.anyBefore7am },
	"night-owl":  func(f raceFacts) bool { return f.anyBefore4am },
}

func lastThreeAll(f raceFacts, ok func(recentRace) bool) bool {
	if len(f.lastThree) < 3 {
		return false
	}
	for _, r := range f.lastThree {
		if !ok(r) {
			return false
		}
	}
	return true
}

// earnedAchievements returns the ids of every achievement the facts satisfy.
func earnedAchievements(f raceFacts) []string {
	var ids []string
	for id, rule := range achievementRules {
		if rule(f) {
			ids = append(ids, id)
		}
	}
	return ids
}

// querier is satisfied by both *pgxpool.Pool and pgx.Tx, so achievements can be synced inside a
// race's own transaction or standalone (on profile load).
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func loadRaceFacts(ctx context.Context, db querier, userID string) (raceFacts, error) {
	var f raceFacts
	err := db.QueryRow(ctx, `
		SELECT
			COUNT(*)::int,
			COALESCE(MAX(wpm), 0)::int,
			COALESCE(ROUND(AVG(accuracy)), 0)::int,
			COUNT(*) FILTER (WHERE placement = 1)::int,
			COALESCE(BOOL_OR(accuracy = 100), false),
			COALESCE(BOOL_OR(placement <= 3), false),
			COALESCE(BOOL_OR(placement = 1 AND racer_count >= 5), false),
			COALESCE(BOOL_OR(local_hour < 7), false),
			COALESCE(BOOL_OR(local_hour < 4), false)
		FROM race_results WHERE user_id = $1
	`, userID).Scan(&f.racesPlayed, &f.bestWPM, &f.avgAccuracy, &f.wins, &f.anyPerfect,
		&f.anyPodium, &f.giantSlayer, &f.anyBefore7am, &f.anyBefore4am)
	if err != nil {
		return f, err
	}

	rows, err := db.Query(ctx, `
		SELECT accuracy, placement FROM race_results
		WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 3
	`, userID)
	if err != nil {
		return f, err
	}
	f.lastThree, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (recentRace, error) {
		var r recentRace
		err := row.Scan(&r.accuracy, &r.placement)
		return r, err
	})
	return f, err
}

// UnlockedAchievement is one achievement newly unlocked by a race, as returned to the client.
type UnlockedAchievement struct {
	ID     string `json:"id"`
	Reward int    `json:"reward"`
}

// syncAchievements unlocks every achievement the player's history now satisfies and hasn't been
// paid for yet, and adds their rewards to the balance. Returns only the newly unlocked ones.
// Called after every race (inside its transaction) and on profile load, which is also how
// players who already had achievements before rewards existed get back pay.
func syncAchievements(ctx context.Context, db querier, userID string) ([]UnlockedAchievement, error) {
	facts, err := loadRaceFacts(ctx, db, userID)
	if err != nil {
		return nil, err
	}
	earned := earnedAchievements(facts)
	if len(earned) == 0 {
		return []UnlockedAchievement{}, nil
	}

	// ON CONFLICT DO NOTHING + RETURNING yields exactly the rows that are new, so an achievement
	// is paid once no matter how many syncs race each other.
	rows, err := db.Query(ctx, `
		INSERT INTO user_achievements (user_id, achievement_id)
		SELECT $1, unnest($2::text[])
		ON CONFLICT DO NOTHING
		RETURNING achievement_id
	`, userID, earned)
	if err != nil {
		return nil, err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, err
	}

	unlocked := make([]UnlockedAchievement, 0, len(ids))
	total := 0
	for _, id := range ids {
		reward := achievementRewards[id]
		unlocked = append(unlocked, UnlockedAchievement{ID: id, Reward: reward})
		total += reward
	}
	if total > 0 {
		if _, err := db.Exec(ctx, `UPDATE users SET coins = coins + $2 WHERE id = $1`, userID, total); err != nil {
			return nil, err
		}
	}
	return unlocked, nil
}

func listAchievements(ctx context.Context, db querier, userID string) ([]string, error) {
	rows, err := db.Query(ctx, `
		SELECT achievement_id FROM user_achievements WHERE user_id = $1 ORDER BY unlocked_at
	`, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}
