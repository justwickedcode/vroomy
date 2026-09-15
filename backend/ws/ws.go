package main

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

// maxConnectionsPerIP bounds how many concurrent WebSocket connections one IP may hold, across
// every /ws/* endpoint (public matchmaking and both private-lobby routes share one counter —
// see upgradeWS) — these connections are long-lived and not covered by a per-request rate
// limiter, so without a cap here, one visitor could trivially open enough sockets to fill every
// lobby by itself. Sized well above any real multi-tab/reconnect-storm use (a real player is
// one connection; a couple of stray reconnects during a flaky network blip is normal) while
// still bounding the worst case.
const maxConnectionsPerIP = 5

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// configureUpgrader must be called once at startup, before any /ws/* route serves traffic — a
// WebSocket handshake carries its own Origin header that gorilla's Upgrader would otherwise
// reject by default (same-origin only) or accept from anywhere (if CheckOrigin were left unset
// entirely).
func configureUpgrader(allowedOrigin string) {
	upgrader.CheckOrigin = func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		return origin == "" || origin == allowedOrigin
	}
}

// ipConnCounter tracks live WebSocket connection counts per IP, purely to enforce
// maxConnectionsPerIP — deliberately separate from backend/api's rateLimiter equivalent, which
// counts discrete HTTP requests over time, not concurrently-open long-lived connections.
type ipConnCounter struct {
	mu    sync.Mutex
	count map[string]int
}

func newIPConnCounter() *ipConnCounter {
	return &ipConnCounter{count: make(map[string]int)}
}

func (i *ipConnCounter) tryAcquire(ip string) bool {
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.count[ip] >= maxConnectionsPerIP {
		return false
	}
	i.count[ip]++
	return true
}

func (i *ipConnCounter) release(ip string) {
	i.mu.Lock()
	defer i.mu.Unlock()
	i.count[ip]--
	if i.count[ip] <= 0 {
		delete(i.count, ip)
	}
}

// upgradeWS does the upgrade + per-IP cap dance shared by every /ws/* endpoint (public
// matchmaking, private-room create, private-room join): check the connection cap, upgrade the
// HTTP connection, build the Client, send the initial welcome, and call assign to hand the
// client to the right room (or reject it, e.g. an unknown private room code) — before starting
// the read/write pumps. assign must run first: readPump's deferred cleanup calls
// c.room.removeClient once the connection ends, so the room needs to already be whatever it's
// going to be (including staying nil, for a rejected join) before that goroutine can possibly
// observe it.
func upgradeWS(w http.ResponseWriter, r *http.Request, conns *ipConnCounter, assign func(*Client)) {
	ip := clientIP(r)
	if !conns.tryAcquire(ip) {
		http.Error(w, "too many concurrent connections", http.StatusTooManyRequests)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		conns.release(ip)
		log.Printf("[ws] upgrade failed: %s\n", err)
		return
	}

	client := &Client{id: newClientID(), conn: conn, send: make(chan []byte, sendBufferSize)}
	client.sendJSON(serverMessage{Type: "welcome", PlayerID: client.id})
	assign(client)

	go client.writePump()
	go func() {
		client.readPump()
		conns.release(ip)
	}()
}

// handleRaceWebSocket upgrades GET /ws/race to a WebSocket and hands the resulting connection
// to mm, which places it into the current public auto-matchmaking lobby.
func handleRaceWebSocket(mm *Matchmaker, conns *ipConnCounter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		upgradeWS(w, r, conns, func(c *Client) { mm.join(c) })
	}
}
