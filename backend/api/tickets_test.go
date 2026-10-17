package main

import (
	"testing"
	"time"
)

func TestRaceTicket_Check(t *testing.T) {
	passage, events, wpm := honestRun(t)
	took := time.Duration(events[len(events)-1][0]) * time.Millisecond
	me, someoneElse := "me", "them"
	now := time.Now()
	soloTicket := func() raceTicket {
		return raceTicket{userID: &me, mode: "solo", passageSHA: passageSHA(passage), age: took + 5*time.Second}
	}
	race := func() *raceRequest {
		return &raceRequest{Mode: "solo", Passage: passage, Replay: events, WPM: wpm, Ticket: "t"}
	}

	cases := []struct {
		name   string
		ticket func() raceTicket
		race   func() *raceRequest
		ok     bool
	}{
		{"an honest race on its own ticket", soloTicket, race, true},
		{"someone else's ticket", func() raceTicket { tk := soloTicket(); tk.userID = &someoneElse; return tk }, race, false},
		{"a used ticket", func() raceTicket { tk := soloTicket(); tk.usedAt = &now; return tk }, race, false},
		{"an expired ticket", func() raceTicket { tk := soloTicket(); tk.age = 3 * time.Hour; return tk }, race, false},
		{"another passage", func() raceTicket { tk := soloTicket(); tk.passageSHA = passageSHA("other"); return tk }, race, false},
		{"another mode", soloTicket, func() *raceRequest { r := race(); r.Mode = "daily"; return r }, false},
		// The replay says the race took ~half a minute, but the ticket was issued 10 seconds ago:
		// a replay made up after the fact.
		{"finished before it could have", func() raceTicket { tk := soloTicket(); tk.age = 10 * time.Second; return tk }, race, false},
	}
	for _, c := range cases {
		msg := c.ticket().check(me, c.race(), now)
		if (msg == "") != c.ok {
			t.Errorf("%s: check() = %q, want ok=%v", c.name, msg, c.ok)
		}
	}
}

func TestRaceTicket_MultiplayerNeedsResult(t *testing.T) {
	passage, events, _ := honestRun(t)
	tk := raceTicket{mode: "multiplayer", passageSHA: passageSHA(passage), age: time.Second}
	race := &raceRequest{Mode: "multiplayer", Passage: passage, Replay: events, Ticket: "t"}
	if msg := tk.check("anyone", race, time.Now()); msg == "" {
		t.Error("a multiplayer ticket with no result was accepted")
	}
	wpm, place, count := float32(80), int16(1), int16(3)
	tk.wpm, tk.placement, tk.racerCount = &wpm, &place, &count
	if msg := tk.check("anyone", race, time.Now()); msg != "" {
		t.Errorf("a multiplayer ticket with its result was refused: %s", msg)
	}
}

// The ws server's own WPM stands even when the browser's timing differs a little.
func TestValidate_ServerResultSkipsClaimedWPM(t *testing.T) {
	passage, events, wpm := honestRun(t)
	req := raceRequest{Mode: "multiplayer", Passage: passage, Replay: events, WPM: wpm + 10,
		Accuracy: 100, Placement: 1, RacerCount: 2}
	if req.validate() == "" {
		t.Fatal("a claimed WPM off from the replay was accepted")
	}
	req.serverResult = true
	if msg := req.validate(); msg != "" {
		t.Errorf("the server's own result was refused: %s", msg)
	}
}
