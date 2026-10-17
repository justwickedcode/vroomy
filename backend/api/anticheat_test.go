package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// honestRun is a real 81 WPM run recorded in the browser (testdata/honest_replay.json).
func honestRun(t *testing.T) (string, []replayEvent, int) {
	t.Helper()
	raw, err := os.ReadFile("testdata/honest_replay.json")
	if err != nil {
		t.Fatal(err)
	}
	var run struct {
		WPM     int           `json:"wpm"`
		Passage string        `json:"passage"`
		Events  []replayEvent `json:"events"`
	}
	if err := json.Unmarshal(raw, &run); err != nil {
		t.Fatal(err)
	}
	return run.Passage, run.Events, run.WPM
}

// scaled replays the run sped up by factor (2 = twice as fast).
func scaled(events []replayEvent, factor float64) []replayEvent {
	out := make([]replayEvent, len(events))
	for i, e := range events {
		out[i] = replayEvent{int(float64(e[0]) / factor), e[1], e[2]}
	}
	return out
}

func TestReplayIntegrity_HonestRunPasses(t *testing.T) {
	passage, events, wpm := honestRun(t)
	if msg := checkReplayIntegrity(passage, events, wpm); msg != "" {
		t.Fatalf("honest run flagged: %s", msg)
	}
}

func TestReplayIntegrity_ClaimedWPMMustMatch(t *testing.T) {
	passage, events, _ := honestRun(t)
	if msg := checkReplayIntegrity(passage, events, 200); msg == "" {
		t.Error("an inflated wpm was accepted")
	}
}

func TestReplayIntegrity_InhumanSpeed(t *testing.T) {
	passage, events, _ := honestRun(t)
	fast := scaled(events, 5) // ~400 wpm
	claimed := int(float64(len(passage)) / 5 / (float64(fast[len(fast)-1][0]) / 60000))
	if msg := checkReplayIntegrity(passage, fast, claimed); msg == "" {
		t.Error("a 400 wpm run was accepted")
	}
}

func TestReplayIntegrity_PastedText(t *testing.T) {
	passage, _, _ := honestRun(t)
	// The whole passage arriving in one go, a few seconds in.
	events := []replayEvent{{3000, 1, 0}, {3100, len(passage), 0}}
	claimed := int(float64(len(passage)) / 5 / (3100.0 / 60000))
	if msg := checkReplayIntegrity(passage, events, claimed); !strings.Contains(msg, "skipped") {
		t.Errorf("a paste was accepted (%q)", msg)
	}
}

func TestReplayIntegrity_RoboticTiming(t *testing.T) {
	passage, _, _ := honestRun(t)
	events := make([]replayEvent, len(passage))
	for i := range events {
		events[i] = replayEvent{1000 + i*150, i + 1, 0} // a key exactly every 150ms
	}
	last := events[len(events)-1][0]
	claimed := int(float64(len(passage)) / 5 / (float64(last) / 60000))
	if msg := checkReplayIntegrity(passage, events, claimed); !strings.Contains(msg, "regular") {
		t.Errorf("a metronome bot was accepted (%q)", msg)
	}
}

func TestReplayIntegrity_AbilitySkipsAllowed(t *testing.T) {
	passage, events, _ := honestRun(t)
	// Swap two stretches of honest typing for single jumps, as Boost and Nitro do.
	skipped := []replayEvent{}
	for _, e := range events {
		if (e[1] > 40 && e[1] < 46) || (e[1] > 100 && e[1] < 110) {
			continue
		}
		skipped = append(skipped, e)
	}
	last := skipped[len(skipped)-1][0]
	claimed := int(float64(len(passage)) / 5 / (float64(last) / 60000))
	if msg := checkReplayIntegrity(passage, skipped, claimed); msg != "" {
		t.Errorf("a run using two abilities was flagged: %s", msg)
	}
}
