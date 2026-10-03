package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// writeWait is how long a single write to the socket may take before it's considered dead.
	writeWait = 10 * time.Second
	// pongWait/pingPeriod: standard gorilla/websocket keepalive pattern — the server pings
	// every pingPeriod, and a connection that hasn't responded (any read, including the pong
	// gorilla's reader handles automatically) within pongWait is considered gone. Needed
	// because these connections are long-lived (a whole race, plus lobby wait time) with no
	// guarantee of steady traffic in either direction otherwise — without this, a client that
	// silently drops (phone locked, wifi died) would sit in the room forever.
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
	// sendBufferSize: how many outbound messages can queue for a slow client before the server
	// gives up on it. A typing race broadcasts one small progress message per opponent
	// keystroke-ish update, times up to raceMaxPlayers-1 opponents — generous enough that a
	// momentary slow patch doesn't drop a client, small enough that a genuinely stuck
	// connection doesn't buffer unbounded memory.
	sendBufferSize = 64
)

// clientMessage is the shape of anything a client sends. type discriminates which of the
// optional fields (only ever one at a time) actually apply.
type clientMessage struct {
	Type      string `json:"type"`
	WordIndex int    `json:"wordIndex,omitempty"`
	ElapsedMs int64  `json:"elapsedMs,omitempty"`
}

// Client wraps one race WebSocket connection. Reading and writing to a single *websocket.Conn
// concurrently from multiple goroutines isn't safe (gorilla's own documented constraint), so
// all writes go through send — readPump owns reads, writePump owns writes, and nothing else
// touches conn directly.
type Client struct {
	id   string
	conn *websocket.Conn
	send chan []byte
	room *Room

	// sendMu guards closed and send together. A sync.Once around just the close() would still
	// let sendJSON race a concurrent closeSend: it could pass a "not closed yet" check and then
	// attempt its channel send after the channel closes underneath it, which panics regardless
	// of the check — sending and closing must be mutually exclusive, not merely "close happens
	// once" and "send is best-effort."
	sendMu sync.Mutex
	closed bool
}

// closeSend closes c.send at most once, safe to call from any goroutine/path that's decided
// this client is finished (a full buffer, a read error, explicit removal) — including a room
// broadcast reaching a client that closed its own send moments earlier (see race.go's
// removeClient, which keeps a disconnected player in the room for final results).
func (c *Client) closeSend() {
	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	if c.closed {
		return
	}
	c.closed = true
	close(c.send)
}

// newClientID returns a short random hex ID — good enough to tell players apart within one
// room's lifetime; nothing here needs to be globally unique, persistent, or unguessable beyond
// "two players in the same race don't collide."
func newClientID() string {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failing is effectively unrecoverable for the whole process anyway; a
		// fixed fallback just avoids a panic for what amounts to a display label.
		return "p_fallback"
	}
	return "p_" + hex.EncodeToString(b)
}

// send helpers below all encode to JSON and push onto the client's send channel rather than
// writing to the socket directly, so writePump remains the only goroutine that ever calls
// conn.Write* — see Client's doc comment.

func (c *Client) sendJSON(v any) {
	body, err := json.Marshal(v)
	if err != nil {
		log.Printf("[ws %s] could not marshal outgoing message: %s\n", c.id, err)
		return
	}

	c.sendMu.Lock()
	defer c.sendMu.Unlock()
	if c.closed {
		return
	}
	select {
	case c.send <- body:
	default:
		// Buffer full — this client is too far behind to keep up. Closing send (rather than
		// blocking, which would stall whichever goroutine is broadcasting to the whole room)
		// triggers writePump's exit path, which closes the connection.
		c.closed = true
		close(c.send)
	}
}

// readPump reads incoming messages until the connection closes or errors, dispatching each to
// the client's room. Must run in its own goroutine; returns (and triggers cleanup) once the
// connection is gone.
func (c *Client) readPump() {
	defer func() {
		// room is nil if this connection never made it into a room at all — e.g. a private-room
		// join request for a code that doesn't exist (see handleJoinPrivateRoom), which sends an
		// error and closes the connection without ever assigning one.
		if c.room != nil {
			c.room.removeClient(c)
		}
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var msg clientMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue // a malformed message from one client shouldn't affect anyone else
		}
		c.room.handleMessage(c, msg)
	}
}

// writePump drains send and writes each message to the socket, plus a periodic ping to keep
// the connection alive through idle proxies/load balancers. Must run in its own goroutine;
// exits (and closes the connection) when send is closed or a write fails.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
