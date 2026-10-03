package main

import (
	"strconv"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Matchmaker hands each newly-connected client a room to join — the current still-waiting one,
// or a fresh one if none is waiting (either because this is the very first race, or because the
// last waiting room just closed to new joiners). One Matchmaker per process; every /ws/race
// connection goes through the same instance.
type Matchmaker struct {
	// newRoom is a field, not a direct call to the package-level newRoom, purely for
	// testability — race_test.go injects a factory that builds rooms with a fake selectQuote,
	// so matchmaking behavior can be exercised without a real Postgres connection.
	newRoom func(id string) *Room

	mu          sync.Mutex
	waitingRoom *Room
	nextRoomID  int
}

func newMatchmaker(pool *pgxpool.Pool) *Matchmaker {
	return &Matchmaker{newRoom: func(id string) *Room { return newRoom(id, pool) }}
}

// join assigns c to a room and adds it there. Safe to call concurrently from many connections'
// handler goroutines at once.
func (m *Matchmaker) join(c *Client) {
	room := m.roomForNewJoiner()
	c.room = room
	room.addClient(c)
}

// roomForNewJoiner returns the current waiting room, creating one if none exists. The returned
// room's onClosed hook is how it tells the matchmaker to stop handing it out once it's full,
// started, or emptied back out — see Room.closeToNewJoiners.
func (m *Matchmaker) roomForNewJoiner() *Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.waitingRoom != nil {
		return m.waitingRoom
	}

	m.nextRoomID++
	id := "r_" + strconv.Itoa(m.nextRoomID)
	room := m.newRoom(id)
	room.onClosed = func() { m.clearIfCurrent(room) }
	m.waitingRoom = room
	return room
}

// clearIfCurrent drops room as the waiting room if it's still the one being handed to new
// joiners — a no-op if a newer room has already taken its place, which can't actually happen
// given a room only ever closes once (see Room.closeToNewJoiners), but guarding it anyway costs
// nothing and removes any doubt about ordering.
func (m *Matchmaker) clearIfCurrent(room *Room) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.waitingRoom == room {
		m.waitingRoom = nil
	}
}
