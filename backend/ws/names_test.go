package main

import (
	"strings"
	"testing"
)

func TestSanitizeName(t *testing.T) {
	cases := map[string]string{
		"":                               "",
		"  Alice  ":                      "Alice",
		"Bob\nSmith":                     "BobSmith",
		"tab\there":                      "tabhere",
		"Zoë":                            "Zoë",
		"abcdefghijklmnopqrstuvwxyz0123": "abcdefghijklmnopqrstuvwx",
		"​\u0007":                        "",
	}
	for in, want := range cases {
		if got := sanitizeName(in); got != want {
			t.Errorf("sanitizeName(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestRoom_BroadcastsPlayerNames verifies every client learns everyone's display name, both in
// the lobby and when the race starts.
func TestRoom_BroadcastsPlayerNames(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three four five"})
	a := testClient("a")
	a.name = "Alice"
	b := testClient("b")
	r.addClient(a)
	r.addClient(b)

	waiting, ok := lastOfType(drain(t, a), "waiting")
	if !ok {
		t.Fatal("expected a waiting message")
	}
	want := []playerInfo{{PlayerID: "a", Name: "Alice", Lane: 0}, {PlayerID: "b", Lane: 1}}
	if len(waiting.Players) != 2 || waiting.Players[0] != want[0] || waiting.Players[1] != want[1] {
		t.Errorf("waiting.Players = %+v, want %+v", waiting.Players, want)
	}

	startNow(r)
	start, ok := lastOfType(drain(t, b), "race_start")
	if !ok {
		t.Fatal("expected a race_start message")
	}
	if len(start.Players) != 2 || start.Players[0].Name != "Alice" {
		t.Errorf("race_start.Players = %+v", start.Players)
	}
}

func TestSanitizeLook(t *testing.T) {
	cases := []struct {
		car, glow, trail string
		want             carLook
	}{
		{"lambo", "#7CF6FF", "inferno", carLook{Car: "lambo", Glow: "#7cf6ff", Trail: "inferno"}},
		{"pixel-buggy-neon", "", "", carLook{Car: "pixel-buggy-neon"}},
		{"Lambo", "7cf6ff", "<b>", carLook{}},
		{"lambo\"", "#12345g", "a b", carLook{}},
		{strings.Repeat("a", 33), "#123", "nitro", carLook{Trail: "nitro"}},
	}
	for _, c := range cases {
		if got := sanitizeLook(c.car, c.glow, c.trail); got != c.want {
			t.Errorf("sanitizeLook(%q, %q, %q) = %+v, want %+v", c.car, c.glow, c.trail, got, c.want)
		}
	}
}

// Every client sees everyone's car as its driver dressed it.
func TestRoom_BroadcastsPlayerLooks(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three four five"})
	a := testClient("a")
	a.look = carLook{Car: "lambo", Glow: "#ff00aa", Trail: "inferno"}
	b := testClient("b")
	r.addClient(a)
	r.addClient(b)

	waiting, ok := lastOfType(drain(t, b), "waiting")
	if !ok || len(waiting.Players) != 2 {
		t.Fatalf("waiting = %+v", waiting)
	}
	got := waiting.Players[0]
	if got.Car != "lambo" || got.Glow != "#ff00aa" || got.Trail != "inferno" {
		t.Errorf("a's look = %+v, want lambo/#ff00aa/inferno", got)
	}
	if other := waiting.Players[1]; other.Car != "" || other.Glow != "" || other.Trail != "" {
		t.Errorf("b sent no look but got %+v", other)
	}
}

// Lanes are the room's, not each client's: a player keeps theirs, and a newcomer fills the gap
// someone left instead of shuffling everyone else.
func TestRoom_LanesStayPut(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three four five"})
	r.host = testClient("host") // a friends room: no auto-start while we shuffle people around
	a, b, c := testClient("a"), testClient("b"), testClient("c")
	r.addClient(a)
	r.addClient(b)
	r.addClient(c)
	r.removeClient(b)
	d := testClient("d")
	r.addClient(d)

	waiting, ok := lastOfType(drain(t, a), "waiting")
	if !ok {
		t.Fatal("expected a waiting message")
	}
	lanes := map[string]int{}
	for _, p := range waiting.Players {
		lanes[p.PlayerID] = p.Lane
	}
	if lanes["a"] != 0 || lanes["c"] != 2 || lanes["d"] != 1 || len(lanes) != 3 {
		t.Errorf("lanes = %v, want a:0 d:1 c:2", lanes)
	}
	for i := 1; i < len(waiting.Players); i++ {
		if waiting.Players[i-1].Lane > waiting.Players[i].Lane {
			t.Errorf("players not in lane order: %+v", waiting.Players)
		}
	}
}
