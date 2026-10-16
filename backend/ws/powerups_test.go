package main

import (
	"slices"
	"testing"
)

func TestParseLobbyMode(t *testing.T) {
	if parseLobbyMode("powerups") != modePowerups {
		t.Error("powerups should parse")
	}
	for _, raw := range []string{"", "classic", "POWERUPS", "anything"} {
		if parseLobbyMode(raw) != modeClassic {
			t.Errorf("%q should fall back to classic", raw)
		}
	}
}

// Classic and powerup players must never be matched into the same room.
func TestMatchmaker_SeparatesModes(t *testing.T) {
	mm := &Matchmaker{
		newRoom: func(id string, mode lobbyMode) *Room {
			r := fakeRoom(TypingQuote{Text: "one two three"})
			r.mode = mode
			return r
		},
		waitingRooms: make(map[lobbyMode]*Room),
	}
	classic := testClient("classic")
	powered := testClient("powered")
	mm.join(classic, modeClassic)
	mm.join(powered, modePowerups)

	if classic.room == powered.room {
		t.Fatal("classic and powerup players landed in the same room")
	}
	if powered.room.mode != modePowerups {
		t.Errorf("powerup room has mode %q", powered.room.mode)
	}
}

// powerupRace starts a powerup room with three players at the given word indexes.
func powerupRace(t *testing.T, a, b, c int) (*Room, *Client, *Client, *Client) {
	t.Helper()
	r := fakeRoom(TypingQuote{Text: "one two three four five six seven eight nine ten"})
	r.mode = modePowerups
	pa, pb, pc := testClient("a"), testClient("b"), testClient("c")
	for _, cl := range []*Client{pa, pb, pc} {
		cl.room = r
		r.addClient(cl)
	}
	startNow(r)
	r.handleProgress(pa, a)
	r.handleProgress(pb, b)
	r.handleProgress(pc, c)
	drain(t, pa)
	drain(t, pb)
	drain(t, pc)
	return r, pa, pb, pc
}

func lastPowerup(t *testing.T, c *Client) (serverMessage, bool) {
	t.Helper()
	return lastOfType(drain(t, c), "powerup_used")
}

func TestPowerup_ShellHitsLeader(t *testing.T) {
	r, a, b, _ := powerupRace(t, 2, 7, 4)
	r.handlePowerup(a, "shell")

	msg, ok := lastPowerup(t, b)
	if !ok {
		t.Fatal("expected a powerup_used broadcast")
	}
	if msg.PlayerID != "a" || msg.Powerup != "shell" || !slices.Equal(msg.Targets, []string{"b"}) {
		t.Errorf("got %+v, want a's shell hitting b (the leader)", msg)
	}
	if msg.FreezeMs != powerupFreezeMs["shell"] {
		t.Errorf("freezeMs = %d", msg.FreezeMs)
	}
}

func TestPowerup_MagnetHitsWhoeverIsJustAhead(t *testing.T) {
	r, a, _, _ := powerupRace(t, 2, 7, 4)
	r.handlePowerup(a, "magnet")

	msg, ok := lastPowerup(t, a)
	if !ok || !slices.Equal(msg.Targets, []string{"c"}) {
		t.Errorf("got %+v, want c (directly ahead of a at word 4)", msg)
	}
}

func TestPowerup_NukeHitsEveryoneElse(t *testing.T) {
	r, a, _, _ := powerupRace(t, 2, 7, 4)
	r.handlePowerup(a, "nuke")

	msg, ok := lastPowerup(t, a)
	if !ok {
		t.Fatal("expected a powerup_used broadcast")
	}
	got := slices.Clone(msg.Targets)
	slices.Sort(got)
	if !slices.Equal(got, []string{"b", "c"}) || msg.FreezeMs != 3000 {
		t.Errorf("got %+v, want b and c frozen for 3s", msg)
	}
}

func TestPowerup_OncePerRace(t *testing.T) {
	r, a, b, _ := powerupRace(t, 2, 7, 4)
	r.handlePowerup(a, "boost")
	drain(t, b)
	r.handlePowerup(a, "nuke")
	if _, ok := lastPowerup(t, b); ok {
		t.Error("a second powerup in the same race was allowed")
	}
}

func TestPowerup_IgnoredInClassicRooms(t *testing.T) {
	r, a, b, _ := powerupRace(t, 2, 7, 4)
	r.mode = modeClassic
	r.handlePowerup(a, "nuke")
	if _, ok := lastPowerup(t, b); ok {
		t.Error("a classic room accepted a powerup")
	}
}

func TestPowerup_UnknownKindIgnored(t *testing.T) {
	r, a, b, _ := powerupRace(t, 2, 7, 4)
	r.handlePowerup(a, "laser")
	if _, ok := lastPowerup(t, b); ok {
		t.Error("an unknown powerup was broadcast")
	}
	// ...and it didn't use up the real one.
	r.handlePowerup(a, "shell")
	if _, ok := lastPowerup(t, b); !ok {
		t.Error("a bogus powerup used up the player's real one")
	}
}
