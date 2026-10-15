package main

import "testing"

func TestValidateReplay(t *testing.T) {
	passage := "go fast"

	cases := []struct {
		name    string
		passage string
		events  []replayEvent
		wantErr bool
	}{
		{name: "valid", passage: passage, events: []replayEvent{{0, 1, 0}, {120, 1, 1}, {200, 3, 0}, {900, 7, 0}}},
		{name: "no passage", passage: "", events: []replayEvent{{0, 0, 0}}, wantErr: true},
		{name: "no events", passage: passage, events: nil, wantErr: true},
		{name: "time goes backwards", passage: passage, events: []replayEvent{{100, 1, 0}, {50, 7, 0}}, wantErr: true},
		{name: "length past passage", passage: passage, events: []replayEvent{{0, 8, 0}}, wantErr: true},
		{name: "negative length", passage: passage, events: []replayEvent{{0, -1, 0}, {10, 7, 0}}, wantErr: true},
		{name: "bad rejected flag", passage: passage, events: []replayEvent{{0, 1, 2}, {10, 7, 0}}, wantErr: true},
		{name: "never finishes", passage: passage, events: []replayEvent{{0, 1, 0}, {10, 6, 0}}, wantErr: true},
		{name: "too long", passage: passage, events: []replayEvent{{0, 1, 0}, {maxReplayMs + 1, 7, 0}}, wantErr: true},
	}

	for _, c := range cases {
		msg := validateReplay(c.passage, c.events)
		if c.wantErr && msg == "" {
			t.Errorf("%s: expected an error", c.name)
		}
		if !c.wantErr && msg != "" {
			t.Errorf("%s: unexpected error %q", c.name, msg)
		}
	}
}

func TestEscapeLike(t *testing.T) {
	if got := escapeLike(`100%_a\b`); got != `100\%\_a\\b` {
		t.Errorf("escapeLike = %q", got)
	}
}
