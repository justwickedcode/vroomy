package main

import "time"

// Anti-cheat for live races. The client tells the server how far it has typed (progress) and when
// it's done (finish), so the server checks both against what a person could actually do:
//
//   - progress only moves forward, and never further than maxHumanWPM allows for the time since
//     GO (plus the words the player's own abilities skipped, and a little slack for latency);
//   - the same ceiling holds over every stretch of the last burstWindow, so waiting at the line
//     and then pasting the passage doesn't hide under the average since GO;
//   - finishing needs the player to have reached the last word, and the time is the server's
//     own clock from GO, never the client's;
//   - a run that breaks either rule is disqualified: no rank, listed as unfinished, told why.
const (
	// maxHumanWPM is a ceiling no honest run gets near (standard 5-character words).
	maxHumanWPM = 300
	// progressSlack covers a progress message in flight while the clock moved on.
	progressSlack = 1500 * time.Millisecond
	// slackWords: a word of give either side of the line, for rounding.
	slackWords = 1
	// burstWindow is how far back each progress step is measured from.
	burstWindow = 5 * time.Second
)

// pacePoint is where a player was at a moment: words typed by hand (abilities' skips taken out).
type pacePoint struct {
	at    time.Time
	typed int
}

// abilitySkipWords is the most words each ability can carry its user forward (see the frontend's
// lib/powerups.ts) — those words arrive without being typed, so they don't count toward speed.
var abilitySkipWords = map[string]int{
	"boost":      1,
	"nitro":      2,
	"slipstream": 4,
	"overdrive":  3,
}

// charsPerWord is the room's average word length including its space, to turn a word count into
// standard (5-character) WPM. Caller must hold r.mu.
func (r *Room) charsPerWordLocked() float64 {
	if r.wordCount == 0 {
		return 5
	}
	return float64(len(r.quote.Text)) / float64(r.wordCount)
}

// maxHonestWordsLocked is the furthest an honest player who has skipped `skipped` words with
// abilities could have got after `elapsed`. Caller must hold r.mu.
func (r *Room) maxHonestWordsLocked(elapsed time.Duration, skipped int) int {
	chars := elapsed.Minutes() * maxHumanWPM * 5
	return int(chars/r.charsPerWordLocked()) + skipped + slackWords
}

// outpacedLocked reports whether reaching wordIndex now outruns maxHumanWPM measured from GO or
// from any progress in the last burstWindow, and records the step. Caller must hold r.mu.
func (r *Room) outpacedLocked(state *playerState, wordIndex int, now time.Time) bool {
	if len(state.pace) == 0 {
		state.pace = append(state.pace, pacePoint{at: r.startedAt})
	}
	typed := wordIndex - state.skippedWords
	for _, p := range state.pace {
		if typed-p.typed > r.maxHonestWordsLocked(now.Sub(p.at)+progressSlack, 0) {
			return true
		}
	}
	state.pace = append(state.pace, pacePoint{at: now, typed: typed})
	for len(state.pace) > 1 && now.Sub(state.pace[0].at) > burstWindow {
		state.pace = state.pace[1:]
	}
	return false
}

// disqualifyLocked takes a player out of the results. Caller must hold r.mu; the caller tells the
// player and the room once it has let go of the lock (see announceDisqualified).
func (r *Room) disqualifyLocked(state *playerState) {
	if state.disqualified {
		return
	}
	state.disqualified = true
	state.finished = true
	state.rank = 0
}

func (r *Room) announceDisqualified(c *Client) {
	c.sendJSON(serverMessage{Type: "error", Message: "Disqualified: That pace isn't humanly possible."})
	r.broadcastExcept(c, serverMessage{Type: "player_left", PlayerID: c.id})
}
