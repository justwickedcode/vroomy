package main

import (
	"sort"
	"time"
)

// lobbyMode is the kind of race a room runs. Players only ever share a room with others who
// picked the same mode — the matchmaker keeps one waiting room per mode, and a private room's
// mode is set by its host when creating it.
type lobbyMode string

const (
	modeClassic  lobbyMode = "classic"  // pure typing, no powerups
	modePowerups lobbyMode = "powerups" // each player may fire their equipped powerup once
)

// parseLobbyMode reads a ?mode= query value. Anything unrecognized (including no value at all,
// e.g. an older client) means classic, so a stale link can never drop someone into a powerup
// race they didn't ask for.
func parseLobbyMode(raw string) lobbyMode {
	if lobbyMode(raw) == modePowerups {
		return modePowerups
	}
	return modeClassic
}

// powerupFreezeMs is how long each powerup freezes the keyboards it hits (it must match
// HIT_EFFECTS in frontend/src/lib/powerups.ts). In solo these knock bots back words; against real
// people that would mean deleting text they've typed, which feels awful, so a hit locks their
// input briefly instead — the same cost (time), without undoing their work. Some hit with only a
// screen effect, drawn by the client (0 here: ink, mirror, quake, disco). Boost, nitro and
// slipstream hit nobody: they skip the user's own words, client-side, and the server sees that as
// ordinary progress; ghost makes the user immune to hits for ghostDuration.
var powerupFreezeMs = map[string]int64{
	"boost":      0,
	"nitro":      0,
	"slipstream": 0,
	"ghost":      0,
	"shell":      1500,
	"magnet":     1500,
	"oil":        1200,
	"mirror":     0,
	"emp":        1000,
	"ink":        0,
	"quake":      0,
	"disco":      0,
	"timewarp":   1500,
	"nuke":       3000,
}

const ghostDuration = 10 * time.Second

// handlePowerup applies c firing kind: once per race, only in a powerup room, only while racing.
// The server picks the targets from its own view of everyone's progress, so every player sees
// the same hit, and broadcasts it to the whole room (the user included, as confirmation).
//
// Which powerup a player fires isn't checked against what they've bought — ws has no login of
// its own to look that up with. It's a known gap, limited to fun-only powerup lobbies.
func (r *Room) handlePowerup(c *Client, kind string) {
	freezeMs, known := powerupFreezeMs[kind]
	if !known {
		return
	}

	r.mu.Lock()
	state, ok := r.players[c]
	if r.mode != modePowerups || r.state != roomRacing || !ok || state.finished || state.usedPowerup {
		r.mu.Unlock()
		return
	}
	state.usedPowerup = true
	if kind == "ghost" {
		state.ghostUntil = time.Now().Add(ghostDuration)
	}
	targets := r.powerupTargetsLocked(c, kind)
	r.mu.Unlock()

	r.broadcast(serverMessage{
		Type:     "powerup_used",
		PlayerID: c.id,
		Powerup:  kind,
		Targets:  targets,
		FreezeMs: freezeMs,
	})
}

// powerupTargetsLocked returns the ids a powerup hits, chosen among opponents still racing and
// not ghosted. Caller must hold r.mu. Mirrors pickTargets in frontend/src/lib/powerups.ts:
//
//   - shell, mirror: whoever is leading
//   - magnet: whoever is directly ahead of the user (the leader if the user is in front)
//   - oil: whoever is right behind the user (whoever's directly ahead if nobody is behind)
//   - emp, ink, quake, disco, timewarp, nuke: everyone
//   - boost, nitro, slipstream, ghost: nobody
func (r *Room) powerupTargetsLocked(user *Client, kind string) []string {
	now := time.Now()
	var rivals []*playerState
	for c, p := range r.players {
		if c != user && p.connected && !p.finished && !now.Before(p.ghostUntil) {
			rivals = append(rivals, p)
		}
	}
	// Furthest along first; id breaks ties so the choice is deterministic.
	sort.Slice(rivals, func(i, j int) bool {
		if rivals[i].wordIndex != rivals[j].wordIndex {
			return rivals[i].wordIndex > rivals[j].wordIndex
		}
		return rivals[i].client.id < rivals[j].client.id
	})

	ids := func(ps []*playerState) []string {
		out := make([]string, len(ps))
		for i, p := range ps {
			out[i] = p.client.id
		}
		return out
	}

	mine := r.players[user].wordIndex
	// The closest rival ahead of the user, or nil.
	nextAhead := func() *playerState {
		for i := len(rivals) - 1; i >= 0; i-- {
			if rivals[i].wordIndex > mine {
				return rivals[i]
			}
		}
		return nil
	}

	switch kind {
	case "shell", "mirror":
		if len(rivals) > 0 {
			return ids(rivals[:1])
		}
	case "magnet":
		if p := nextAhead(); p != nil {
			return []string{p.client.id}
		}
		if len(rivals) > 0 {
			return ids(rivals[:1])
		}
	case "oil":
		for _, p := range rivals {
			if p.wordIndex <= mine {
				return []string{p.client.id}
			}
		}
		if p := nextAhead(); p != nil {
			return []string{p.client.id}
		}
	case "emp", "ink", "quake", "disco", "timewarp", "nuke":
		return ids(rivals)
	}
	return nil
}
