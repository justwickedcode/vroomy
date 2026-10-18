package main

import (
	"context"
	"encoding/json"
	"log"
	"math/rand/v2"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Ghosts: a quick-match player left alone in the lobby used to be offered a solo race instead.
// Now, after ghostWait, the room fills up with ghosts — real races from other players, replayed
// keystroke by keystroke from their stored replays — and races. A ghost drives exactly like that
// player did, at the same WPM, just stretched over this room's passage. When there aren't enough
// stored races, steady-paced pace cars make up the numbers.
const (
	// ghostWait matches the frontend's own countdown for a player alone in quick match.
	ghostWait = 30 * time.Second
	maxGhosts = 3
	// Only races in this range become ghosts: beatable, and not a crawl.
	ghostMinWPM = 30
	ghostMaxWPM = 140
	// ghostLoadTimeout bounds the one query for them.
	ghostLoadTimeout = 2 * time.Second
)

// ghostRun is a stored race to replay: who ran it, on how long a passage, and its keystrokes
// ([ms, typedLength, rejected], see backend/api's replays.go).
type ghostRun struct {
	name       string
	look       carLook
	passageLen int
	events     [][3]int
}

// pacePlan is a ghost's drive: how far through the passage (0-1) it is at each moment.
type pacePlan []struct {
	at   time.Duration
	frac float64
}

// plan turns a stored race into a drive over a passage of passageLen characters, at the same
// speed: the timeline stretches by how much longer this passage is.
func (g ghostRun) plan(passageLen int) pacePlan {
	if g.passageLen == 0 || len(g.events) == 0 {
		return nil
	}
	stretch := float64(passageLen) / float64(g.passageLen)
	out := make(pacePlan, 0, len(g.events))
	for _, e := range g.events {
		out = append(out, struct {
			at   time.Duration
			frac float64
		}{
			at:   time.Duration(float64(e[0])*stretch) * time.Millisecond,
			frac: float64(e[1]) / float64(g.passageLen),
		})
	}
	return out
}

// steadyPlan is a pace car's drive: wpm, with a little wobble so it doesn't look scripted.
func steadyPlan(wpm float64, passageLen int) pacePlan {
	msPerChar := 60000 / (wpm * 5)
	var out pacePlan
	at := 0.0
	for typed := 1; typed <= passageLen; typed++ {
		at += msPerChar * (0.6 + 0.8*rand.Float64())
		out = append(out, struct {
			at   time.Duration
			frac float64
		}{time.Duration(at) * time.Millisecond, float64(typed) / float64(passageLen)})
	}
	return out
}

// wordTimes is when the plan reaches each word boundary of a wordCount-word passage: element i
// is the moment it has typed i+1 words.
func (p pacePlan) wordTimes(wordCount int) []time.Duration {
	out := make([]time.Duration, 0, wordCount)
	i := 0
	for w := 1; w <= wordCount; w++ {
		target := float64(w) / float64(wordCount)
		for i < len(p)-1 && p[i].frac < target-1e-9 {
			i++
		}
		out = append(out, p[i].at)
	}
	return out
}

func loadGhostsFrom(pool *pgxpool.Pool) func(exclude string, n int) ([]ghostRun, error) {
	return func(exclude string, n int) ([]ghostRun, error) {
		ctx, cancel := context.WithTimeout(context.Background(), ghostLoadTimeout)
		defer cancel()
		// One race per player, verified ones only (backend/api's race_results.verified), never the
		// player's own.
		rows, err := pool.Query(ctx, `
			SELECT name, car, glow, trail, passage, replay FROM (
				SELECT DISTINCT ON (r.user_id) u.display_name AS name, u.car_model AS car,
					CASE WHEN u.underglow THEN u.underglow_color ELSE '' END AS glow, u.trail,
					r.passage, r.replay
				FROM race_results r JOIN users u ON u.id = r.user_id
				WHERE r.verified AND r.replay IS NOT NULL AND r.user_id <> $1
					AND r.wpm BETWEEN $2 AND $3
				ORDER BY r.user_id, random()
			) one_each ORDER BY random() LIMIT $4
		`, exclude, ghostMinWPM, ghostMaxWPM, n)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var runs []ghostRun
		for rows.Next() {
			var (
				name, car, glow, trail, passage string
				raw                             []byte
			)
			if err := rows.Scan(&name, &car, &glow, &trail, &passage, &raw); err != nil {
				return nil, err
			}
			var events [][3]int
			if json.Unmarshal(raw, &events) != nil || len(passage) == 0 {
				continue
			}
			runs = append(runs, ghostRun{
				name:       name,
				look:       sanitizeLook(car, glow, trail),
				passageLen: len(passage),
				events:     events,
			})
		}
		return runs, rows.Err()
	}
}

// paceCarWPMs are the pace cars' speeds, slowest first.
var paceCarWPMs = []float64{45, 65, 85}

// fillWithGhosts runs ghostWait after a lone player arrives in a public room: if they're still
// alone, ghosts join and the race starts the usual way (cars drive in, then the lights).
func (r *Room) fillWithGhosts() {
	r.mu.Lock()
	r.ghostTimer = nil
	human := r.loneHumanLocked()
	if r.state != roomWaiting || r.host != nil || human == nil {
		r.mu.Unlock()
		return
	}
	r.mu.Unlock()

	var runs []ghostRun
	if r.loadGhosts != nil {
		loaded, err := r.loadGhosts(human.racer, maxGhosts)
		if err != nil {
			log.Printf("[race %s] could not load ghosts: %s\n", r.id, err)
		}
		runs = loaded
	}

	r.mu.Lock()
	if r.state != roomWaiting || r.loneHumanLocked() != human {
		r.mu.Unlock()
		return
	}
	for i := 0; i < maxGhosts; i++ {
		g := &Client{id: newClientID(), send: make(chan []byte), closed: true}
		state := &playerState{client: g, connected: true, ghost: true, lane: r.freeLaneLocked()}
		if i < len(runs) {
			// A ghost drives the car its player does.
			g.name = sanitizeName(runs[i].name + "'s ghost")
			g.look = runs[i].look
			state.ghostRun = &runs[i]
		} else {
			g.name = "Pace car"
			state.ghostWPM = paceCarWPMs[i%len(paceCarWPMs)]
		}
		r.players[g] = state
	}
	// No more joiners from here (closeToNewJoiners' hook, taken here rather than by calling it,
	// since it would also stop the timer below).
	closed := r.onClosed
	r.onClosed = nil
	r.waitDeadline = time.Now().Add(lobbyWaitTimeout)
	r.waitTimer = time.AfterFunc(lobbyWaitTimeout, r.startCountdown)
	msg := r.waitingMessageLocked()
	r.mu.Unlock()

	if closed != nil {
		closed()
	}
	r.broadcast(msg)
}

// updateGhostTimerLocked runs the ghost clock while a public room has exactly one player
// waiting, and stops it otherwise. Caller must hold r.mu.
func (r *Room) updateGhostTimerLocked() {
	alone := r.state == roomWaiting && r.host == nil && r.loneHumanLocked() != nil
	switch {
	case alone && r.ghostTimer == nil:
		r.ghostTimer = time.AfterFunc(ghostWait, r.fillWithGhosts)
	case !alone && r.ghostTimer != nil:
		r.ghostTimer.Stop()
		r.ghostTimer = nil
	}
}

// loneHumanLocked is the one real player in the room, or nil if there isn't exactly one (and no
// ghosts yet). Caller must hold r.mu.
func (r *Room) loneHumanLocked() *Client {
	if len(r.players) != 1 {
		return nil
	}
	for c, s := range r.players {
		if !s.ghost {
			return c
		}
	}
	return nil
}

// humansConnectedLocked reports whether any real player is still in the race. Caller must hold
// r.mu.
func (r *Room) humansConnectedLocked() bool {
	for _, s := range r.players {
		if !s.ghost && s.connected {
			return true
		}
	}
	return false
}

// startGhostsLocked sets every ghost driving, from GO. Caller must hold r.mu.
func (r *Room) startGhostsLocked() {
	passageLen := len(r.quote.Text)
	for c, s := range r.players {
		if !s.ghost {
			continue
		}
		plan := steadyPlan(s.ghostWPM, passageLen)
		if s.ghostRun != nil {
			plan = s.ghostRun.plan(passageLen)
		}
		go r.driveGhost(c, plan.wordTimes(r.wordCount), r.startedAt)
	}
}

// driveGhost reports a ghost's progress word by word, on its plan's schedule, then finishes it.
func (r *Room) driveGhost(g *Client, times []time.Duration, startedAt time.Time) {
	for i, at := range times {
		time.Sleep(time.Until(startedAt.Add(at)))
		r.mu.Lock()
		racing := r.state == roomRacing
		r.mu.Unlock()
		if !racing {
			return
		}
		if i == len(times)-1 {
			r.handleFinish(g, 0)
			return
		}
		r.handleProgress(g, i+1)
	}
}
