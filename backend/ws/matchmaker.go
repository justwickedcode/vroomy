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
	newRoom func(id string, mode lobbyMode) *Room

	mu sync.Mutex
	// One waiting room per lobby mode, so classic and powerup players never get matched
	// together.
	waitingRooms map[lobbyMode]*Room
	nextRoomID   int
}

func newMatchmaker(pool *pgxpool.Pool) *Matchmaker {
	return &Matchmaker{
		newRoom:      func(id string, mode lobbyMode) *Room { return newRoom(id, mode, pool) },
		waitingRooms: make(map[lobbyMode]*Room),
	}
}

// join assigns c to a room of the given mode and adds it there. Safe to call concurrently from
// many connections' handler goroutines at once.
func (m *Matchmaker) join(c *Client, mode lobbyMode) {
	room := m.roomForNewJoiner(mode)
	c.room = room
	room.addClient(c)
}

// roomForNewJoiner returns the current waiting room for mode, creating one if none exists. The
// returned room's onClosed hook is how it tells the matchmaker to stop handing it out once it's
// full, started, or emptied back out — see Room.closeToNewJoiners.
func (m *Matchmaker) roomForNewJoiner(mode lobbyMode) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	if room := m.waitingRooms[mode]; room != nil {
		return room
	}

	m.nextRoomID++
	id := "r_" + strconv.Itoa(m.nextRoomID)
	room := m.newRoom(id, mode)
	room.onClosed = func() { m.clearIfCurrent(mode, room) }
	m.waitingRooms[mode] = room
	return room
}

// clearIfCurrent drops room as the waiting room if it's still the one being handed to new
// joiners — a no-op if a newer room has already taken its place, which can't actually happen
// given a room only ever closes once (see Room.closeToNewJoiners), but guarding it anyway costs
// nothing and removes any doubt about ordering.
func (m *Matchmaker) clearIfCurrent(mode lobbyMode, room *Room) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.waitingRooms[mode] == room {
		delete(m.waitingRooms, mode)
	}
}
