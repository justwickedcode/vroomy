package main

import "sort"

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

// powerupFreezeMs is how long each powerup freezes the keyboards it hits. In solo these knock
// bots back words; against real people that would mean deleting text they've typed, which feels
// awful, so a hit locks their input briefly instead — the same cost (time), without undoing
// their work. Boost and nitro hit nobody: they skip the user's own words, client-side, and the
// server sees that as ordinary progress.
var powerupFreezeMs = map[string]int64{
	"boost":  0,
	"nitro":  0,
	"shell":  1500,
	"magnet": 1500,
	"emp":    1000,
	"nuke":   3000,
}

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

// powerupTargetsLocked returns the ids a powerup hits, chosen among opponents still racing.
// Caller must hold r.mu.
//
//   - shell: whoever is leading
//   - magnet: whoever is directly ahead of the user (the leader if the user is in front)
//   - emp, nuke: everyone
//   - boost, nitro: nobody
func (r *Room) powerupTargetsLocked(user *Client, kind string) []string {
	var rivals []*playerState
	for c, p := range r.players {
		if c != user && p.connected && !p.finished {
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

	switch kind {
	case "shell":
		if len(rivals) > 0 {
			return ids(rivals[:1])
		}
	case "magnet":
		mine := r.players[user].wordIndex
		for i := len(rivals) - 1; i >= 0; i-- {
			if rivals[i].wordIndex > mine {
				return ids(rivals[i : i+1])
			}
		}
		if len(rivals) > 0 {
			return ids(rivals[:1])
		}
	case "emp", "nuke":
		return ids(rivals)
	}
	return nil
}
