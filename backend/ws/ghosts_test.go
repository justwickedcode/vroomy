package main

import (
	"strings"
	"testing"
	"time"
)

// A replayed race keeps its WPM on a passage twice as long: it takes twice as long.
func TestGhost_PlanKeepsItsPace(t *testing.T) {
	run := ghostRun{passageLen: 10, events: [][3]int{{500, 5, 0}, {1000, 10, 0}}}
	plan := run.plan(20)
	if got := plan[len(plan)-1].at; got != 2*time.Second {
		t.Errorf("finishes at %s on a passage twice as long, want 2s", got)
	}
	times := plan.wordTimes(4)
	if len(times) != 4 || times[1] != time.Second || times[3] != 2*time.Second {
		t.Errorf("word times = %v, want halfway at 1s and done at 2s", times)
	}
}

// Alone in quick match: the ghosts come out, labelled, and the room stops taking joiners.
func TestGhost_FillsALoneRoom(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three four"})
	closed := false
	r.onClosed = func() { closed = true }
	r.loadGhosts = func(exclude string, n int) ([]ghostRun, error) {
		return []ghostRun{{name: "Ada", passageLen: 18, events: [][3]int{{1000, 18, 0}}}}, nil
	}
	a := testClient("a")
	r.addClient(a)
	r.mu.Lock()
	timing := r.ghostTimer != nil
	r.mu.Unlock()
	if !timing {
		t.Fatal("no ghost clock for a lone player")
	}
	drain(t, a)

	r.fillWithGhosts()
	msg, ok := lastOfType(drain(t, a), "waiting")
	if !ok || msg.PlayersInRoom != 1+maxGhosts || msg.StartsInMs <= 0 {
		t.Fatalf("waiting = %+v, want %d players and a start time", msg, 1+maxGhosts)
	}
	var names []string
	for _, p := range msg.Players {
		names = append(names, p.Name)
	}
	if joined := strings.Join(names, ","); !strings.Contains(joined, "Ada's ghost") || !strings.Contains(joined, "Pace car") {
		t.Errorf("players = %v, want Ada's ghost and pace cars", names)
	}
	if !closed {
		t.Error("a room full of ghosts still takes joiners")
	}
	r.mu.Lock()
	running := r.waitTimer != nil && r.waitTimer.Stop()
	r.mu.Unlock()
	if !running {
		t.Error("the race won't start: its clock isn't running")
	}
}

// Company before the clock runs out: no ghosts.
func TestGhost_NotWhenSomeoneJoins(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three four"})
	r.addClient(testClient("a"))
	r.addClient(testClient("b"))
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.ghostTimer != nil {
		t.Error("the ghost clock kept running with two players in")
	}
}

// A ghost races to the line and gets its place; the real player still gets a receipt, the
// ghost doesn't.
func TestGhost_DrivesToTheFinish(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three four"})
	receipts := 0
	r.issueReceipt = func(raceReceipt) (string, error) { receipts++; return "t", nil }
	r.loadGhosts = func(string, int) ([]ghostRun, error) {
		return []ghostRun{{name: "Ada", passageLen: 18, events: [][3]int{{300, 9, 0}, {800, 18, 0}}}}, nil
	}
	a := testClient("a")
	r.addClient(a)
	r.fillWithGhosts()
	// Only the replayed ghost, to keep this quick.
	r.mu.Lock()
	for c, s := range r.players {
		if s.ghost && s.ghostRun == nil {
			delete(r.players, c)
		}
	}
	r.mu.Unlock()
	r.startCountdown()
	r.beginRacing()
	time.Sleep(1200 * time.Millisecond)

	finished, ok := lastOfType(drain(t, a), "player_finished")
	if !ok || finished.Rank != 1 {
		t.Fatalf("got %+v, want the ghost finishing 1st", finished)
	}
	if receipts != 0 {
		t.Error("a ghost got a receipt")
	}
}
