package main

import "testing"

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
	want := []playerInfo{{PlayerID: "a", Name: "Alice"}, {PlayerID: "b"}}
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
