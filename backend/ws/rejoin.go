package main

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// Rejoining a race: a dropped connection (flaky wifi, a reload) used to mean dropping out. Now,
// when a race's countdown starts, every player gets a seat token, sent to them alone. Connecting
// again with ?seat=<token> while that race is still running puts them straight back in the same
// car, under the same player id, with their progress intact — the token is the only thing that
// can claim a seat, so nobody else can take it over.

// seats maps every running race's seat tokens to their room. Rooms register their tokens when
// the countdown starts and drop them when the race ends.
var seats = &seatRegistry{rooms: make(map[string]*Room)}

type seatRegistry struct {
	mu    sync.Mutex
	rooms map[string]*Room
}

func (s *seatRegistry) add(token string, r *Room) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rooms[token] = r
}

func (s *seatRegistry) drop(tokens []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, t := range tokens {
		delete(s.rooms, t)
	}
}

func (s *seatRegistry) lookup(token string) *Room {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.rooms[token]
}

func newSeatToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	return hex.EncodeToString(b)
}

// handOutSeatsLocked gives every player a seat token and registers them, returning who gets
// which so the caller can send them once it lets go of the lock. Caller must hold r.mu.
func (r *Room) handOutSeatsLocked() map[*Client]string {
	out := make(map[*Client]string, len(r.players))
	for c, state := range r.players {
		if state.ghost {
			continue
		}
		state.seat = newSeatToken()
		if state.seat == "" {
			continue
		}
		seats.add(state.seat, r)
		out[c] = state.seat
	}
	return out
}

// dropSeatsLocked unregisters the room's seat tokens once the race is over. Caller must hold
// r.mu.
func (r *Room) dropSeatsLocked() {
	tokens := make([]string, 0, len(r.players))
	for _, state := range r.players {
		if state.seat != "" {
			tokens = append(tokens, state.seat)
		}
	}
	seats.drop(tokens)
}

// resume seats c in the place its seat token holds, if that player dropped out of this race and
// it's still running (and they hadn't finished). It reports whether it did;
// if not, c is untouched and should join the normal way.
func (r *Room) resume(c *Client, seat string) bool {
	r.mu.Lock()
	if r.state != roomCountdown && r.state != roomRacing {
		r.mu.Unlock()
		return false
	}
	var old *Client
	var state *playerState
	for oc, s := range r.players {
		if s.seat == seat {
			old, state = oc, s
			break
		}
	}
	if state == nil || state.connected || state.finished {
		r.mu.Unlock()
		return false
	}

	// Take over the old connection's place, under its id, so opponents keep tracking the same car.
	delete(r.players, old)
	c.id, c.name, c.racer, c.look = old.id, old.name, old.racer, old.look
	c.room = r
	state.client = c
	state.connected = true
	r.players[c] = state
	if r.host == old {
		r.host = c
	}

	msg := serverMessage{
		Type:      "resume",
		PlayerID:  c.id,
		Mode:      string(r.mode),
		Quote:     &r.quote,
		WordCount: r.wordCount,
		WordIndex: state.wordIndex,
		Players:   r.playerListLocked(),
		Seat:      seat,
	}
	if r.state == roomCountdown {
		msg.StartsInMs = max(time.Until(r.goAt).Milliseconds(), 1)
	} else {
		msg.ElapsedMs = max(time.Since(r.startedAt).Milliseconds(), 1)
	}
	// Where everyone else is, after the resume itself.
	var catchUp []serverMessage
	for oc, s := range r.players {
		switch {
		case oc == c:
		case s.finished:
			catchUp = append(catchUp, serverMessage{Type: "player_finished", PlayerID: oc.id,
				Rank: s.rank, ElapsedMs: s.elapsedMs, WPM: roundTo2(s.wpm)})
		case !s.connected:
			catchUp = append(catchUp, serverMessage{Type: "player_left", PlayerID: oc.id})
		default:
			catchUp = append(catchUp, serverMessage{Type: "player_progress", PlayerID: oc.id, WordIndex: s.wordIndex})
		}
	}
	wordIndex := state.wordIndex
	r.mu.Unlock()

	c.sendJSON(msg)
	for _, m := range catchUp {
		c.sendJSON(m)
	}
	r.broadcastExcept(c, serverMessage{Type: "player_back", PlayerID: c.id, WordIndex: wordIndex})
	return true
}
