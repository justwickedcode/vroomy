package main

import (
	"context"
	"testing"
)

func TestPrivateRooms_CreateThenJoin(t *testing.T) {
	pr := newPrivateRooms(nil)
	host := testClient("host")

	room, code := pr.create(host)
	if len(code) != codeLength {
		t.Fatalf("code %q has length %d, want %d", code, len(code), codeLength)
	}
	if room.code != code || room.host != host {
		t.Fatalf("room.code = %q, room.host = %v, want %q / host", room.code, room.host, code)
	}

	found, ok := pr.join(code)
	if !ok || found != room {
		t.Fatalf("join(%q) = (%v, %v), want the created room", code, found, ok)
	}
}

func TestPrivateRooms_JoinUnknownCode(t *testing.T) {
	pr := newPrivateRooms(nil)
	if _, ok := pr.join("NOSUCH"); ok {
		t.Error("join found a room for a code that was never created")
	}
}

// TestPrivateRooms_CodeFreedOnceRoomStarts verifies a room's code stops resolving once the room
// closes to new joiners — the whole point of removing it from the map via onClosed, so a late
// joiner clicking a stale link gets "room not found" instead of sneaking into an already-full
// or already-racing room.
func TestPrivateRooms_CodeFreedOnceRoomStarts(t *testing.T) {
	pr := newPrivateRooms(nil)
	host := testClient("host")
	room, code := pr.create(host)
	room.selectQuote = func(ctx context.Context) (TypingQuote, error) {
		return TypingQuote{Text: "one two three"}, nil
	}

	room.addClient(host)
	for i := 0; i < raceMaxPlayers-1; i++ {
		room.addClient(testClient(string(rune('a' + i))))
	}

	waitFor(t, func() bool {
		_, ok := pr.join(code)
		return !ok
	})
}

func TestPrivateRooms_CreateReturnsUniqueCodes(t *testing.T) {
	pr := newPrivateRooms(nil)
	seen := make(map[string]bool)
	for i := 0; i < 200; i++ {
		_, code := pr.create(testClient("host"))
		if seen[code] {
			t.Fatalf("duplicate code %q returned by create", code)
		}
		seen[code] = true
	}
}

func TestRandomCode_UsesOnlyCodeAlphabet(t *testing.T) {
	for i := 0; i < 100; i++ {
		code := randomCode()
		if len(code) != codeLength {
			t.Fatalf("randomCode() = %q, want length %d", code, codeLength)
		}
		for _, ch := range code {
			found := false
			for _, allowed := range codeAlphabet {
				if ch == allowed {
					found = true
					break
				}
			}
			if !found {
				t.Fatalf("randomCode() = %q contains %q, not in codeAlphabet", code, ch)
			}
		}
	}
}
