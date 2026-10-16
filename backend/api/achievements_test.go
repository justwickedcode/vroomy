package main

import (
	"bytes"
	"os"
	"slices"
	"testing"
)

func TestAchievementRewardsMatchFrontend(t *testing.T) {
	frontend, err := os.ReadFile("../../frontend/src/lib/shop/achievement_rewards.json")
	if err != nil {
		t.Fatalf("read frontend rewards: %v", err)
	}
	if !bytes.Equal(bytes.TrimSpace(frontend), bytes.TrimSpace(achievementRewardsJSON)) {
		t.Fatal("backend/api/achievement_rewards.json and frontend/src/lib/shop/achievement_rewards.json differ")
	}
}

// Every rule has a reward and every reward has a rule — a typo in either id would otherwise
// mean an achievement that never pays, or a reward nothing can earn.
func TestAchievementRulesAndRewardsAgree(t *testing.T) {
	for id := range achievementRules {
		if achievementRewards[id] <= 0 {
			t.Errorf("rule %q has no reward", id)
		}
	}
	for id := range achievementRewards {
		if achievementRules[id] == nil {
			t.Errorf("reward %q has no rule", id)
		}
	}
}

func TestEarnedAchievements(t *testing.T) {
	has := func(f raceFacts, id string) bool { return slices.Contains(earnedAchievements(f), id) }

	if len(earnedAchievements(raceFacts{})) != 0 {
		t.Error("a player with no races shouldn't have earned anything")
	}

	f := raceFacts{racesPlayed: 12, bestWPM: 85, avgAccuracy: 96, wins: 1, anyPodium: true}
	for _, id := range []string{"first-lap", "getting-warmed-up", "speed-demon", "highway-cruiser", "marathoner", "steady-hands", "on-the-podium", "checkered-flag"} {
		if !has(f, id) {
			t.Errorf("expected %s", id)
		}
	}
	for _, id := range []string{"century-club", "road-warrior", "hat-trick", "sharpshooter", "early-bird"} {
		if has(f, id) {
			t.Errorf("did not expect %s", id)
		}
	}

	streak := raceFacts{racesPlayed: 3, lastThree: []recentRace{{100, 1}, {100, 1}, {100, 1}}}
	if !has(streak, "flawless-streak") || !has(streak, "win-streak") {
		t.Error("three perfect wins in a row should unlock both streaks")
	}
	broken := raceFacts{racesPlayed: 3, lastThree: []recentRace{{100, 1}, {99, 2}, {100, 1}}}
	if has(broken, "flawless-streak") || has(broken, "win-streak") {
		t.Error("a broken streak shouldn't count")
	}

	if !has(raceFacts{racesPlayed: 1, anyBefore4am: true, anyBefore7am: true}, "night-owl") {
		t.Error("a race before 4am should unlock night owl")
	}
}
