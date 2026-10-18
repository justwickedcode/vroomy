package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// testClient builds a Client with a real send channel but no actual network connection —
// everything race.go touches on a Client (id, send via sendJSON/closeSend) works identically
// without one; only readPump/writePump (not exercised here) need a real *websocket.Conn.
func testClient(id string) *Client {
	return &Client{id: id, send: make(chan []byte, sendBufferSize)}
}

// drain reads every message currently queued on c.send without blocking, decoding each as a
// serverMessage — a test helper for asserting "the client received these messages," not
// production code.
func drain(t *testing.T, c *Client) []serverMessage {
	t.Helper()
	var out []serverMessage
	for {
		select {
		case body, ok := <-c.send:
			if !ok {
				return out
			}
			var msg serverMessage
			if err := json.Unmarshal(body, &msg); err != nil {
				t.Fatalf("client %s received invalid JSON: %s", c.id, err)
			}
			out = append(out, msg)
		default:
			return out
		}
	}
}

func lastOfType(msgs []serverMessage, typ string) (serverMessage, bool) {
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Type == typ {
			return msgs[i], true
		}
	}
	return serverMessage{}, false
}

func fakeRoom(quote TypingQuote) *Room {
	r := newRoom("test-room", modeClassic, nil)
	r.selectQuote = func(ctx context.Context) (TypingQuote, error) { return quote, nil }
	return r
}

// startNow skips past lobbyWaitTimeout — the join/timeout/max-players mechanics are already
// covered by TestRoom_WaitsForMinPlayers and TestRoom_StartsImmediatelyAtMaxPlayers, so tests
// concerned with what happens once a race is underway trigger the countdown directly instead of
// either waiting out the real 4.5s timer or padding the room to raceMaxPlayers with filler
// clients that would then also need to finish before finishRace ever fires.
func startNow(r *Room) {
	r.closeToNewJoiners()
	r.startCountdown()
	// startCountdown only schedules beginRacing for raceCountdown from now; calling it directly
	// collapses that wait to nothing. The real timer still fires later and finds the room
	// already past roomCountdown, so it's a harmless no-op.
	r.beginRacing()
}

// TestRoom_WaitsForMinPlayers verifies a lone player never starts a race — the whole point of
// raceMinPlayers.
func TestRoom_WaitsForMinPlayers(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three four five"})
	a := testClient("a")
	r.addClient(a)

	msgs := drain(t, a)
	waiting, ok := lastOfType(msgs, "waiting")
	if !ok {
		t.Fatalf("expected a waiting message, got %+v", msgs)
	}
	if waiting.PlayersInRoom != 1 {
		t.Errorf("PlayersInRoom = %d, want 1", waiting.PlayersInRoom)
	}
	if _, started := lastOfType(msgs, "race_start"); started {
		t.Error("race started with only one player")
	}
}

// TestRoom_StartsImmediatelyAtMaxPlayers verifies a room doesn't wait out lobbyWaitTimeout once
// it's already full — confirmed by how fast this test itself needs to complete.
func TestRoom_StartsImmediatelyAtMaxPlayers(t *testing.T) {
	quote := TypingQuote{Text: "one two three four five", Author: "Test", Language: "en"}
	r := fakeRoom(quote)

	clients := make([]*Client, raceMaxPlayers)
	for i := range clients {
		clients[i] = testClient(string(rune('a' + i)))
		r.addClient(clients[i])
	}

	deadline := time.After(2 * time.Second)
	for {
		msgs := drain(t, clients[0])
		if start, ok := lastOfType(msgs, "race_start"); ok {
			if start.Quote == nil || start.Quote.Text != quote.Text {
				t.Errorf("race_start quote = %+v, want %+v", start.Quote, quote)
			}
			if start.WordCount != 5 {
				t.Errorf("WordCount = %d, want 5", start.WordCount)
			}
			return
		}
		select {
		case <-deadline:
			t.Fatal("room never started even though raceMaxPlayers joined")
		case <-time.After(10 * time.Millisecond):
		}
	}
}

// TestRoom_FullRaceLifecycle drives two players through join → race_start → go → progress →
// finish → race_end, checking ranks and that a finished player's own progress isn't echoed
// back to themselves.
func TestRoom_FullRaceLifecycle(t *testing.T) {
	quote := TypingQuote{Text: "one two three four five", Author: "Test", Language: "en"}
	r := fakeRoom(quote)

	a := testClient("a")
	b := testClient("b")
	r.addClient(a)
	r.addClient(b)
	startNow(r)

	waitFor(t, func() bool {
		_, ok := lastOfType(drain(t, a), "go")
		return ok
	})

	r.handleMessage(a, clientMessage{Type: "progress", WordIndex: 3})
	waitFor(t, func() bool {
		msgs := drain(t, b)
		p, ok := lastOfType(msgs, "player_progress")
		return ok && p.PlayerID == "a" && p.WordIndex == 3
	})
	// a's own progress must never be echoed back to a itself.
	for _, m := range drain(t, a) {
		if m.Type == "player_progress" && m.PlayerID == "a" {
			t.Error("a received its own progress update")
		}
	}

	// Both reach the last word before finishing, as a real client does.
	r.handleMessage(a, clientMessage{Type: "progress", WordIndex: 4})
	r.handleMessage(b, clientMessage{Type: "progress", WordIndex: 4})
	r.handleMessage(a, clientMessage{Type: "finish", ElapsedMs: 10000})
	r.handleMessage(b, clientMessage{Type: "finish", ElapsedMs: 20000})

	var results []playerResult
	waitFor(t, func() bool {
		msgs := drain(t, a)
		end, ok := lastOfType(msgs, "race_end")
		if ok {
			results = end.Results
		}
		return ok
	})

	if len(results) != 2 {
		t.Fatalf("got %d results, want 2: %+v", len(results), results)
	}
	byID := map[string]playerResult{}
	for _, res := range results {
		byID[res.PlayerID] = res
	}
	if byID["a"].Rank != 1 {
		t.Errorf("a's rank = %d, want 1 (finished first)", byID["a"].Rank)
	}
	if byID["b"].Rank != 2 {
		t.Errorf("b's rank = %d, want 2 (finished second)", byID["b"].Rank)
	}
	// 23 characters (4.6 standard words) in 10s = 27.6 wpm.
	if byID["a"].WPM != 27.6 {
		t.Errorf("a's wpm = %v, want 27.6", byID["a"].WPM)
	}
}

// TestRoom_DisconnectDuringRaceCountsAsUnfinished verifies a mid-race disconnect doesn't hang
// the room forever waiting for someone who's gone, and doesn't crash on the resulting broadcast
// to a now-shorter player list.
func TestRoom_DisconnectDuringRaceCountsAsUnfinished(t *testing.T) {
	quote := TypingQuote{Text: "one two three four five"}
	r := fakeRoom(quote)

	a := testClient("a")
	b := testClient("b")
	r.addClient(a)
	r.addClient(b)
	startNow(r)

	waitFor(t, func() bool {
		_, ok := lastOfType(drain(t, a), "go")
		return ok
	})

	r.handleMessage(a, clientMessage{Type: "progress", WordIndex: 5})
	r.handleMessage(a, clientMessage{Type: "finish", ElapsedMs: 10000})
	r.removeClient(b) // b disconnects instead of finishing

	var results []playerResult
	waitFor(t, func() bool {
		end, ok := lastOfType(drain(t, a), "race_end")
		if ok {
			results = end.Results
		}
		return ok
	})

	if len(results) != 2 {
		t.Fatalf("got %d results, want 2 (b still scored as unfinished): %+v", len(results), results)
	}
}

// TestMatchmaker_FreshRoomAfterPreviousStarts verifies a new joiner never lands in a room
// that's already moved past accepting players — the real bug this would need to catch is the
// matchmaker handing out a stale room reference after it fills/starts.
func TestMatchmaker_FreshRoomAfterPreviousStarts(t *testing.T) {
	mm := &Matchmaker{
		newRoom:      func(id string, mode lobbyMode) *Room { return fakeRoom(TypingQuote{Text: "one two three"}) },
		waitingRooms: make(map[lobbyMode]*Room),
	}

	a := testClient("a")
	b := testClient("b")
	mm.join(a, modeClassic)
	mm.join(b, modeClassic)
	if a.room != b.room {
		t.Fatal("two joiners with no full room yet should land in the same room")
	}
	first := a.room

	// Filling the room to raceMaxPlayers should close it to new joiners (see
	// Room.closeToNewJoiners), so the matchmaker must hand the next joiner a different room.
	for i := 0; i < raceMaxPlayers-2; i++ {
		mm.join(testClient(string(rune('c'+i))), modeClassic)
	}

	waitFor(t, func() bool { return first.playerCount() == raceMaxPlayers })

	next := testClient("z")
	mm.join(next, modeClassic)
	if next.room == first {
		t.Fatal("matchmaker handed a new joiner a room that already started")
	}
}

// TestRoom_HostCanStartEarly verifies a private room's host can skip lobbyWaitTimeout once
// raceMinPlayers has joined, without waiting the real 4.5s out.
func TestRoom_HostCanStartEarly(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three four five"})
	host := testClient("host")
	r.host = host
	r.addClient(host)
	r.addClient(testClient("b"))

	r.handleMessage(host, clientMessage{Type: "start"})

	waitFor(t, func() bool {
		_, ok := lastOfType(drain(t, host), "race_start")
		return ok
	})
}

// TestRoom_NonHostCannotStartEarly verifies only the designated host's "start" message has any
// effect — anyone else's is silently ignored, same as an out-of-state message from any client.
func TestRoom_NonHostCannotStartEarly(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three four five"})
	host := testClient("host")
	other := testClient("b")
	r.host = host
	r.addClient(host)
	r.addClient(other)
	drain(t, host) // clear the "waiting" backlog so the next drain only sees new messages

	r.handleMessage(other, clientMessage{Type: "start"})

	time.Sleep(50 * time.Millisecond)
	if _, ok := lastOfType(drain(t, host), "race_start"); ok {
		t.Error("a non-host's start message started the race")
	}
}

// TestRoom_HostCannotStartBelowMinPlayers verifies a lone host can't force a one-player race.
func TestRoom_HostCannotStartBelowMinPlayers(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three four five"})
	host := testClient("host")
	r.host = host
	r.addClient(host)

	r.handleMessage(host, clientMessage{Type: "start"})

	time.Sleep(50 * time.Millisecond)
	if _, ok := lastOfType(drain(t, host), "race_start"); ok {
		t.Error("host started a race alone, below raceMinPlayers")
	}
}

// TestRoom_PublicRoomIgnoresStart verifies "start" has no effect on an auto-matched public room
// (host is nil there), even from a player who happens to be first in.
func TestRoom_PublicRoomIgnoresStart(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three four five"})
	a := testClient("a")
	r.addClient(a)
	r.addClient(testClient("b"))
	drain(t, a)

	r.handleMessage(a, clientMessage{Type: "start"})

	time.Sleep(50 * time.Millisecond)
	if _, ok := lastOfType(drain(t, a), "race_start"); ok {
		t.Error("start had an effect on a public room with no host")
	}
}

// waitFor polls cond every few milliseconds until it's true or a short deadline passes —
// everything in race.go runs asynchronously off timers/goroutines, so tests observe it by
// polling rather than assuming synchronous completion.
func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition never became true within the deadline")
}

// One person, one seat: joining a waiting room again (a second tab, or coming back after leaving)
// takes over the old seat, and the old connection is told why it was dropped.
func TestRoom_SameRacerTakesOverTheirSeat(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three"})
	first, second := testClient("a"), testClient("b")
	first.racer, second.racer = "user-1", "user-1"
	r.addClient(first)
	r.addClient(second)

	r.mu.Lock()
	_, firstStill := r.players[first]
	_, secondIn := r.players[second]
	seats := len(r.players)
	r.mu.Unlock()
	if seats != 1 || firstStill || !secondIn {
		t.Fatalf("seats=%d first=%v second=%v, want only the new tab seated", seats, firstStill, secondIn)
	}
	if msg, ok := lastOfType(drain(t, first), "error"); !ok || msg.Message == "" {
		t.Errorf("old tab got %+v, want an error", msg)
	}
}

// A seat that has already disconnected (left mid-race) never blocks the same person.
func TestRoom_DisconnectedSeatDoesNotBlock(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three"})
	old := testClient("a")
	old.racer = "user-1"
	r.addClient(old)
	r.mu.Lock()
	r.players[old].connected = false
	r.mu.Unlock()

	again := testClient("b")
	again.racer = "user-1"
	r.addClient(again)
	r.mu.Lock()
	_, seated := r.players[again]
	r.mu.Unlock()
	if !seated {
		t.Error("coming back was refused because of a disconnected seat")
	}
}

func TestSanitizeRacerID(t *testing.T) {
	for raw, want := range map[string]string{
		"user-1_A":              "user-1_A",
		"":                      "",
		"has space":             "",
		"<script>":              "",
		strings.Repeat("a", 65): "",
	} {
		if got := sanitizeRacerID(raw); got != want {
			t.Errorf("sanitizeRacerID(%q) = %q, want %q", raw, got, want)
		}
	}
}

// Once a second player joins, every "waiting" update says how long until the race starts on
// its own; dropping back to one player stops that clock.
func TestRoom_WaitingCarriesStartDeadline(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three"})
	a, b := testClient("a"), testClient("b")
	r.addClient(a)
	if msg, _ := lastOfType(drain(t, a), "waiting"); msg.StartsInMs != 0 {
		t.Errorf("alone: startsInMs = %d, want none", msg.StartsInMs)
	}
	r.addClient(b)
	msg, _ := lastOfType(drain(t, a), "waiting")
	if msg.StartsInMs <= 0 || msg.StartsInMs > lobbyWaitTimeout.Milliseconds() {
		t.Errorf("two players: startsInMs = %d, want within the wait", msg.StartsInMs)
	}
	r.removeClient(b)
	if msg, _ := lastOfType(drain(t, a), "waiting"); msg.StartsInMs != 0 {
		t.Errorf("back to one: startsInMs = %d, want the clock stopped", msg.StartsInMs)
	}
}

// Taking over your seat in a friends room keeps you the host.
func TestRoom_TakeOverKeepsHost(t *testing.T) {
	r := fakeRoom(TypingQuote{Text: "one two three"})
	first, second := testClient("a"), testClient("b")
	first.racer, second.racer = "user-1", "user-1"
	r.host = first
	r.addClient(first)
	r.addClient(second)
	if r.host != second {
		t.Error("the new tab didn't become host")
	}
	if _, ok := lastOfType(drain(t, second), "host_assigned"); !ok {
		t.Error("the new tab wasn't told it's the host")
	}
}

// raceOf starts a two-player race on a long passage and returns it with both players at GO.
func raceOf(t *testing.T) (*Room, *Client, *Client) {
	t.Helper()
	text := strings.TrimSpace(strings.Repeat("quick brown fox jumps ", 20)) // 80 words
	r := fakeRoom(TypingQuote{Text: text})
	a, b := testClient("a"), testClient("b")
	r.addClient(a)
	r.addClient(b)
	startNow(r)
	drain(t, a)
	drain(t, b)
	return r, a, b
}

// Progress never goes backwards.
func TestRace_ProgressOnlyForward(t *testing.T) {
	r, a, _ := raceOf(t)
	r.handleMessage(a, clientMessage{Type: "progress", WordIndex: 3})
	r.handleMessage(a, clientMessage{Type: "progress", WordIndex: 1})
	r.mu.Lock()
	got := r.players[a].wordIndex
	r.mu.Unlock()
	if got != 3 {
		t.Errorf("wordIndex = %d, want 3", got)
	}
}

// A finisher gets a receipt carrying the server's own result, before their player_finished.
func TestRace_FinisherGetsReceipt(t *testing.T) {
	r, a, _ := raceOf(t)
	var got raceReceipt
	r.issueReceipt = func(rc raceReceipt) (string, error) { got = rc; return "ticket-1", nil }
	r.mu.Lock()
	r.startedAt = time.Now().Add(-time.Minute)
	r.mu.Unlock()
	r.handleMessage(a, clientMessage{Type: "progress", WordIndex: 80})
	r.handleMessage(a, clientMessage{Type: "finish", ElapsedMs: 60000})

	msgs := drain(t, a)
	receiptAt, finishedAt := -1, -1
	for i, m := range msgs {
		switch m.Type {
		case "receipt":
			receiptAt = i
			if m.Ticket != "ticket-1" {
				t.Errorf("receipt ticket = %q", m.Ticket)
			}
		case "player_finished":
			finishedAt = i
		}
	}
	if receiptAt < 0 || finishedAt < 0 || receiptAt > finishedAt {
		t.Fatalf("receipt at %d, player_finished at %d: want the receipt first", receiptAt, finishedAt)
	}
	if got.placement != 1 || got.racerCount != 2 || got.wpm < 50 || got.wpm > 100 {
		t.Errorf("receipt = %+v, want 1st of 2 at the server's measured pace", got)
	}
}

// Rejoin: a racer who drops out comes back with their seat token, under the same id and with
// their progress; the others see them back.
func TestRejoin_SeatTokenResumesRace(t *testing.T) {
	r, a, b := raceOf(t)
	r.handleMessage(a, clientMessage{Type: "progress", WordIndex: 2})
	r.mu.Lock()
	seat := r.players[a].seat
	r.mu.Unlock()
	if seat == "" || seats.lookup(seat) != r {
		t.Fatal("no seat token registered at race start")
	}
	r.removeClient(a)
	drain(t, b)

	if r.resume(testClient("intruder"), "not-the-token") {
		t.Fatal("a wrong token took a seat")
	}
	back := testClient("new-conn")
	if !r.resume(back, seat) {
		t.Fatal("the seat token didn't get the racer back in")
	}
	if back.id != "a" {
		t.Errorf("rejoined as %q, want the old id %q", back.id, "a")
	}
	msg, ok := lastOfType(drain(t, back), "resume")
	if !ok || msg.WordIndex != 2 || msg.Quote == nil || msg.ElapsedMs <= 0 {
		t.Errorf("resume = %+v, want the passage, word 2 and the race clock", msg)
	}
	if _, ok := lastOfType(drain(t, b), "player_back"); !ok {
		t.Error("the opponent wasn't told the racer is back")
	}
	if r.resume(testClient("again"), seat) {
		t.Error("a seat that's already taken back was taken again")
	}
}

// A race that's over can't be rejoined, and forgets its seats.
func TestRejoin_NotAfterTheRaceEnds(t *testing.T) {
	r, a, _ := raceOf(t)
	r.mu.Lock()
	seat := r.players[a].seat
	r.mu.Unlock()
	r.removeClient(a)
	r.finishRace()
	if seats.lookup(seat) != nil {
		t.Error("a finished race's seat is still registered")
	}
	if r.resume(testClient("late"), seat) {
		t.Error("rejoined a finished race")
	}
}
