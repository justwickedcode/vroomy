package main

import (
	"crypto/rand"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// codeAlphabet excludes visually ambiguous characters (0/O, 1/I) — a private room code is
	// meant to be read aloud or typed by hand by a friend, not just copy-pasted the way the
	// join link itself always allows for.
	codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	codeLength   = 6
)

// privateRooms tracks currently-joinable private rooms by their share code. Unlike Matchmaker's
// single waitingRoom, many private rooms can be open at once — one per active "invite my
// friends" flow — so this is a map, not a single field.
type privateRooms struct {
	pool *pgxpool.Pool

	mu    sync.Mutex
	rooms map[string]*Room
}

func newPrivateRooms(pool *pgxpool.Pool) *privateRooms {
	return &privateRooms{pool: pool, rooms: make(map[string]*Room)}
}

// create makes a new private room, makes host its host (the only client allowed to force an
// early start — see Room.handleStart), and returns the room and its freshly-generated share
// code. The caller is responsible for actually adding host to the returned room (see
// handleCreatePrivateRoom) — create only reserves the code and builds the room.
func (p *privateRooms) create(host *Client) (*Room, string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	var code string
	for {
		code = randomCode()
		if _, exists := p.rooms[code]; !exists {
			break
		}
	}

	room := newRoom(code, p.pool)
	room.code = code
	room.host = host
	room.onClosed = func() { p.remove(code) }
	p.rooms[code] = room
	return room, code
}

// join returns the still-open private room for code, if one exists. A code that never existed,
// already started (and was therefore removed by the room's onClosed hook — see create), or
// belonged to a room that's since finished all report the same "not found" outcome; the caller
// can't and doesn't need to tell those apart.
func (p *privateRooms) join(code string) (*Room, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	room, ok := p.rooms[code]
	return room, ok
}

func (p *privateRooms) remove(code string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.rooms, code)
}

// randomCode returns a codeLength string drawn from codeAlphabet.
func randomCode() string {
	b := make([]byte, codeLength)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failing is effectively unrecoverable for the whole process anyway; a
		// fixed fallback just avoids a panic here specifically. The extremely unlikely
		// resulting code collision is handled the same way a real collision would be: create's
		// retry loop just tries again.
		return "AAAAAA"
	}
	out := make([]byte, codeLength)
	for i, v := range b {
		out[i] = codeAlphabet[int(v)%len(codeAlphabet)]
	}
	return string(out)
}
