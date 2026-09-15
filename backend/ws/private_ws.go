package main

import (
	"net/http"
	"strings"
)

// handleCreatePrivateRoom upgrades GET /ws/private/create to a WebSocket, reserves a fresh
// private room and share code, and joins the caller to it as host — the only client later
// allowed to send "start" (see Room.handleStart).
func handleCreatePrivateRoom(pr *privateRooms, conns *ipConnCounter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		upgradeWS(w, r, conns, func(c *Client) {
			room, _ := pr.create(c)
			c.room = room
			room.addClient(c)
		})
	}
}

// handleJoinPrivateRoom upgrades GET /ws/private/join?code=ABCDEF to a WebSocket and joins the
// caller to the private room for that code. An unknown, already-started, or already-finished
// code (all indistinguishable to the caller — see privateRooms.join) gets an "error" message
// and an immediate close rather than a bare HTTP failure, since the upgrade has already
// happened by the time the code is checked and the client is expecting to speak the WS protocol
// from here on, not interpret an HTTP status.
func handleJoinPrivateRoom(pr *privateRooms, conns *ipConnCounter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("code")))

		upgradeWS(w, r, conns, func(c *Client) {
			room, found := pr.join(code)
			if !found {
				c.sendJSON(serverMessage{Type: "error", Message: "room not found"})
				c.closeSend()
				return
			}
			c.room = room
			room.addClient(c)
		})
	}
}
