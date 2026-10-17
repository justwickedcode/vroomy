package main

import (
	"testing"
	"time"
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

func TestPowerup_RechargesBetweenUses(t *testing.T) {
	r, a, b, _ := powerupRace(t, 2, 7, 4)
	r.handlePowerup(a, "boost")
	drain(t, b)
	r.handlePowerup(a, "overdrive")
	if _, ok := lastPowerup(t, b); ok {
		t.Error("an ability fired again before it recharged")
	}

	// Once abilityRecharge has passed, it's ready again.
	r.mu.Lock()
	r.players[a].lastPowerupAt = time.Now().Add(-abilityRecharge)
	r.mu.Unlock()
	r.handlePowerup(a, "overdrive")
	if _, ok := lastPowerup(t, b); !ok {
		t.Error("a recharged ability couldn't be fired")
	}
}

func TestPowerup_IgnoredInClassicRooms(t *testing.T) {
	r, a, b, _ := powerupRace(t, 2, 7, 4)
	r.mode = modeClassic
	r.handlePowerup(a, "overdrive")
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
	r.handlePowerup(a, "nitro")
	if _, ok := lastPowerup(t, b); !ok {
		t.Error("a bogus powerup used up the player's real one")
	}
}

func TestPowerup_AnnouncedToEveryone(t *testing.T) {
	r, a, b, c := powerupRace(t, 2, 7, 4)
	r.handlePowerup(a, "slipstream")

	for _, cl := range []*Client{a, b, c} {
		msg, ok := lastPowerup(t, cl)
		if !ok || msg.PlayerID != "a" || msg.Powerup != "slipstream" {
			t.Errorf("%s got %+v, want a's slipstream", cl.id, msg)
		}
	}
}
