package main

import (
	"math"
)

// Anti-cheat for races typed in the browser (solo, daily — and multiplayer, whose replays are
// stored here too). A race arrives with its replay: every keystroke as [ms, typedLength,
// rejected] (see replays.go). Nothing client-side can be proven, but a replay has to look like a
// person typed it, and the score has to be the one the replay actually shows:
//
//   - the claimed WPM must match the replay's own timing;
//   - what was typed by hand stays under a human ceiling, sustained and in short bursts;
//   - text that appeared in jumps (an ability skipping words, or a paste) is limited to what the
//     abilities could account for;
//   - a long run of keystrokes with machine-perfect timing is a bot.
const (
	// maxHumanWPM is a ceiling no honest run gets near: well past world-record sustained speeds.
	maxHumanWPM = 300
	// burstWindowMs/maxBurstChars: no more than this many hand-typed characters in any one
	// second (≈ 360 WPM for that second).
	burstWindowMs = 1000
	maxBurstChars = 30
	// Abilities recharge every abilityRechargeMs (frontend/src/lib/powerups.ts); one use skips
	// at most maxSkipsPerAbility separate times (Overdrive: three bonus words).
	abilityRechargeMs  = 12000
	maxSkipsPerAbility = 3
	// At most this share of the passage may arrive in jumps rather than keystrokes.
	maxSkippedShare = 0.5
	// roboticMinKeys/roboticMaxJitterMs: this many hand-typed keystrokes whose spacing barely
	// varies at all is a script, not fingers.
	roboticMinKeys     = 30
	roboticMaxJitterMs = 4.0
	// wpmTolerance: how far the claimed WPM may be from the replay's (rounding, timer edges).
	wpmToleranceAbs   = 3
	wpmToleranceShare = 0.05
)

// checkReplayIntegrity returns why a race's replay (already validated as well-formed by
// validateReplay) doesn't hold up as an honest run of claimedWPM, or "" if it does.
func checkReplayIntegrity(passage string, events []replayEvent, claimedWPM int) string {
	durationMs := events[len(events)-1][0]
	if durationMs < 1000 {
		return "race too short to be real"
	}
	minutes := float64(durationMs) / 60000

	// Walk the keystrokes: single-character steps are hand-typed; bigger jumps are skips.
	prevLen := 0
	skippedChars, skipEvents := 0, 0
	var typedTimes []int
	for _, e := range events {
		t, length := e[0], e[1]
		delta := length - prevLen
		switch {
		case delta == 1:
			typedTimes = append(typedTimes, t)
		case delta > 1:
			skippedChars += delta
			skipEvents++
		}
		if length > prevLen {
			prevLen = length
		}
	}

	replayWPM := float64(len(passage)) / 5 / minutes
	tolerance := math.Max(wpmToleranceAbs, replayWPM*wpmToleranceShare)
	if math.Abs(float64(claimedWPM)-replayWPM) > tolerance {
		return "wpm doesn't match the replay"
	}

	if float64(skippedChars) > float64(len(passage))*maxSkippedShare {
		return "too much of the passage skipped"
	}
	abilityUses := durationMs/abilityRechargeMs + 1
	if skipEvents > abilityUses*maxSkipsPerAbility {
		return "too many skips for the abilities available"
	}

	typedWPM := float64(len(typedTimes)) / 5 / minutes
	if typedWPM > maxHumanWPM {
		return "typing speed beyond human"
	}
	start := 0
	for end := range typedTimes {
		for typedTimes[end]-typedTimes[start] >= burstWindowMs {
			start++
		}
		if end-start+1 > maxBurstChars {
			return "typing burst beyond human"
		}
	}

	if len(typedTimes) >= roboticMinKeys && intervalJitter(typedTimes) < roboticMaxJitterMs {
		return "keystroke timing too regular to be human"
	}
	return ""
}

// intervalJitter is the standard deviation of the gaps between consecutive keystrokes, in ms.
func intervalJitter(times []int) float64 {
	n := len(times) - 1
	if n < 1 {
		return math.Inf(1)
	}
	var sum float64
	for i := 1; i < len(times); i++ {
		sum += float64(times[i] - times[i-1])
	}
	mean := sum / float64(n)
	var sq float64
	for i := 1; i < len(times); i++ {
		d := float64(times[i]-times[i-1]) - mean
		sq += d * d
	}
	return math.Sqrt(sq / float64(n))
}
