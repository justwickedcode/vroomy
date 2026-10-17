package main

import "time"

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

// knownPowerups lists the abilities a player can fire (frontend/src/lib/powerups.ts). Like
// NitroType's nitros, every one only helps the player who fires it — nobody can hit, slow or
// distract anyone else — so the server just enforces the recharge and announces it; the user's
// client applies the effect (skipped words reach the server as ordinary progress).
var knownPowerups = map[string]bool{
	"boost":      true,
	"nitro":      true,
	"slipstream": true,
	"overdrive":  true,
}

// abilityRecharge is how long after firing a player can fire again (ABILITY_RECHARGE_MS in
// frontend/src/lib/powerups.ts).
const abilityRecharge = 12 * time.Second

// handlePowerup applies c firing kind: only in an ability room, only while racing, and only once
// it has recharged since the last time; then it's broadcast to the whole room (the user included,
// as confirmation) so everyone sees it on the user's car.
//
// Which ability a player fires isn't checked against what they've bought — ws has no login of
// its own to look that up with. It's a known gap, limited to fun-only ability lobbies.
func (r *Room) handlePowerup(c *Client, kind string) {
	if !knownPowerups[kind] {
		return
	}

	r.mu.Lock()
	state, ok := r.players[c]
	now := time.Now()
	if r.mode != modePowerups || r.state != roomRacing || !ok || state.finished ||
		(!state.lastPowerupAt.IsZero() && now.Sub(state.lastPowerupAt) < abilityRecharge) {
		r.mu.Unlock()
		return
	}
	state.lastPowerupAt = now
	state.skippedWords += abilitySkipWords[kind]
	r.mu.Unlock()

	r.broadcast(serverMessage{
		Type:     "powerup_used",
		PlayerID: c.id,
		Powerup:  kind,
	})
}
