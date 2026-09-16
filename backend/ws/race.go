package main

import (
	"context"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// raceMinPlayers/raceMaxPlayers: a race needs at least two people to be a race at all; the
	// upper bound keeps a single lobby's broadcast fan-out small and matches a "small lobby"
	// typing-race feel rather than an open-ended free-for-all.
	raceMinPlayers = 2
	raceMaxPlayers = 6

	// lobbyWaitTimeout: once raceMinPlayers is reached, the lobby waits this long for more
	// players before starting anyway — long enough to give a real chance for the lobby to fill
	// toward raceMaxPlayers, short enough that the first two players don't wait forever for a
	// third. Never applies before raceMinPlayers is reached; a lone player just waits.
	lobbyWaitTimeout = 15 * time.Second

	// raceCountdown: time between the quote being announced and the race actually starting —
	// gives every client's UI a chance to render the quote and show a "get ready" countdown in
	// sync, rather than the fastest client's connection effectively getting a head start.
	raceCountdown = 3 * time.Second

	// raceMaxDuration: a hard stop so one player alt-tabbing away mid-race (or just never
	// finishing) doesn't leave the room open indefinitely — everyone still racing at this point
	// is scored as unfinished rather than the room hanging forever.
	raceMaxDuration = 5 * time.Minute

	// raceLanguage/raceMinWords/raceMaxWords: fixed for v1 — every player in a room races the
	// same quote, so there's one selection per room rather than per player. Per-room language
	// selection is a reasonable future addition, not something v1 needs.
	raceLanguage = "en"
	// raceMinWords/raceMaxWords match backend/api's own REST endpoint defaults (see its
	// server.go) purely for a consistent typing-race feel between the two services — short
	// passages finish in a couple of seconds even for an average typist, and extrapolating a
	// multi-second burst to a per-minute rate is numerically unstable.
	raceMinWords = 25
	raceMaxWords = 60
)

type roomState int

const (
	roomWaiting roomState = iota
	roomCountdown
	roomRacing
	roomFinished
)

// playerState is what the room tracks about one client's progress through the current quote.
// wordIndex is the client's own self-reported progress (used only for the live opponent-
// progress broadcast, purely cosmetic); elapsedMs/wpm/rank are only meaningful once finished.
type playerState struct {
	client    *Client
	wordIndex int
	finished  bool
	// connected is false once this player has disconnected mid-race. A disconnected player
	// stays in the map (so final results still list them as unfinished) but must stop blocking
	// allFinishedLocked — otherwise one dropped connection would keep the race from ever
	// completing on its own, hanging it until raceMaxDuration.
	connected bool
	elapsedMs int64
	wpm       float64
	rank      int
}

// Room is one race: a fixed set of players racing the same quote from the same start signal.
// All state is guarded by mu — clients can join, send progress, finish, or disconnect from
// their own goroutines at any time relative to the room's own timers firing.
type Room struct {
	id string
	// selectQuote is a field, not a direct call to RandomTypingQuote, purely for testability —
	// race_test.go injects a fake one so the room lifecycle (join, countdown, race, results)
	// can be exercised without a real Postgres connection.
	selectQuote func(ctx context.Context) (TypingQuote, error)

	mu      sync.Mutex
	state   roomState
	players map[*Client]*playerState
	quote   TypingQuote
	// wordCount is computed once from quote.Text at race_start time — the authoritative count
	// both the server's own WPM calculation and each client's local progress tracking use, so
	// there's no ambiguity between however the client itself tokenizes words.
	wordCount     int
	startedAt     time.Time
	waitTimer     *time.Timer
	raceTimer     *time.Timer
	finishedCount int

	// onClosed is called exactly once, when this room stops accepting new players (started or
	// torn down) — the matchmaker's/privateRooms' hook to stop directing new joiners here. nil
	// is a valid, harmless no-op default so Room doesn't need to know about its owner at
	// construction time.
	onClosed func()

	// code is this room's private-lobby share code, empty for an auto-matched public room —
	// set once by privateRooms.create, before the room is exposed to anyone, so it's safe to
	// read without holding mu.
	code string
	// host is the client allowed to force an early start via a "start" message (see
	// handleStart), skipping lobbyWaitTimeout — nil for a public room, where no one has that
	// privilege. Set once, the same way as code.
	host *Client
}

func newRoom(id string, pool *pgxpool.Pool) *Room {
	return &Room{
		id: id,
		selectQuote: func(ctx context.Context) (TypingQuote, error) {
			return RandomTypingQuote(ctx, pool, raceLanguage, raceMinWords, raceMaxWords, "")
		},
		state:   roomWaiting,
		players: make(map[*Client]*playerState),
	}
}

// addClient adds c to the room and broadcasts the updated waiting count. Must only be called
// while the room is still in roomWaiting (the matchmaker is responsible for not routing anyone
// to a room that's already moved past that — see Matchmaker.join).
func (r *Room) addClient(c *Client) {
	r.mu.Lock()
	r.players[c] = &playerState{client: c, connected: true}
	count := len(r.players)
	r.mu.Unlock()

	r.broadcast(serverMessage{
		Type:          "waiting",
		Code:          r.code,
		PlayersInRoom: count,
		MinPlayers:    raceMinPlayers,
		MaxPlayers:    raceMaxPlayers,
	})
	if c == r.host {
		// Told apart from "waiting" (which every player in the room gets) so the frontend knows
		// specifically which connection may send "start" — see handleStart.
		c.sendJSON(serverMessage{Type: "host_assigned"})
	}

	switch {
	case count >= raceMaxPlayers:
		r.closeToNewJoiners()
		r.startCountdown()
	case count == raceMinPlayers:
		// First time this room has enough to race at all — start the "wait for more, but not
		// forever" clock. Only fires once: later joins below raceMaxPlayers don't reset it,
		// intentionally, so a room can't be kept in limbo indefinitely by a slow trickle of
		// joiners each resetting the timeout right before it fires.
		r.mu.Lock()
		r.waitTimer = time.AfterFunc(lobbyWaitTimeout, func() {
			r.closeToNewJoiners()
			r.startCountdown()
		})
		r.mu.Unlock()
	}
}

// removeClient handles a disconnect at any room state. A player leaving mid-race just stops
// counting toward "everyone finished"; leaving during waiting/countdown removes them outright.
func (r *Room) removeClient(c *Client) {
	r.mu.Lock()
	state, ok := r.players[c]
	if !ok {
		r.mu.Unlock()
		return
	}
	wasRacing := r.state == roomRacing || r.state == roomCountdown
	if wasRacing {
		state.connected = false
	} else {
		delete(r.players, c)
	}
	remaining := len(r.players)
	allFinishedNow := wasRacing && r.allFinishedLocked()
	r.mu.Unlock()

	c.closeSend()

	if !ok || state == nil {
		return
	}
	if wasRacing {
		r.broadcast(serverMessage{Type: "player_left", PlayerID: c.id})
		if allFinishedNow {
			r.finishRace()
		}
		return
	}
	if remaining == 0 {
		r.closeToNewJoiners()
		return
	}
	r.broadcast(serverMessage{
		Type:          "waiting",
		Code:          r.code,
		PlayersInRoom: remaining,
		MinPlayers:    raceMinPlayers,
		MaxPlayers:    raceMaxPlayers,
	})
}

// closeToNewJoiners stops this room from accepting more players (whether because it's about to
// start or because everyone left before it ever did) and tells the matchmaker so, exactly once.
func (r *Room) closeToNewJoiners() {
	r.mu.Lock()
	if r.waitTimer != nil {
		r.waitTimer.Stop()
	}
	hook := r.onClosed
	r.onClosed = nil
	r.mu.Unlock()
	if hook != nil {
		hook()
	}
}

// startCountdown picks this room's quote, announces it, and schedules the actual race start.
// A no-op if the room no longer has enough players (everyone left during the wait window) or
// has already moved past waiting some other way.
func (r *Room) startCountdown() {
	r.mu.Lock()
	if r.state != roomWaiting || len(r.players) < raceMinPlayers {
		r.mu.Unlock()
		return
	}
	r.state = roomCountdown
	r.mu.Unlock()

	quote, err := r.selectQuote(context.Background())
	if err != nil {
		log.Printf("[race %s] could not select a quote: %s\n", r.id, err)
		r.broadcast(serverMessage{Type: "error", Message: "could not start race, try again"})
		r.mu.Lock()
		r.state = roomFinished
		r.mu.Unlock()
		return
	}

	// Same tokenization backend/scraper's own word_count column uses (see
	// internal/db/store.go's SaveQuote) — the two must agree, since the client-side progress
	// bar and this server's own WPM calculation both assume "word count" means the same thing
	// everywhere.
	wordCount := len(strings.Fields(quote.Text))

	r.mu.Lock()
	r.quote = quote
	r.wordCount = wordCount
	r.mu.Unlock()

	r.broadcast(serverMessage{
		Type:       "race_start",
		Quote:      &quote,
		WordCount:  r.wordCount,
		StartsInMs: raceCountdown.Milliseconds(),
	})

	time.AfterFunc(raceCountdown, r.beginRacing)
}

func (r *Room) beginRacing() {
	r.mu.Lock()
	if r.state != roomCountdown {
		r.mu.Unlock()
		return
	}
	r.state = roomRacing
	r.startedAt = time.Now()
	r.raceTimer = time.AfterFunc(raceMaxDuration, r.finishRace)
	r.mu.Unlock()

	r.broadcast(serverMessage{Type: "go"})
}

// handleMessage dispatches one already-decoded message from c to the appropriate handler.
// Anything received outside the state it's meaningful in is silently ignored — a client
// finishing twice, or a progress update arriving just after the race ended, is a normal race
// condition (pun intended) between network timing and room state, not an error worth logging.
func (r *Room) handleMessage(c *Client, msg clientMessage) {
	switch msg.Type {
	case "progress":
		r.handleProgress(c, msg.WordIndex)
	case "finish":
		r.handleFinish(c, msg.ElapsedMs)
	case "start":
		r.handleStart(c)
	}
}

// handleStart lets a private room's host skip lobbyWaitTimeout and start immediately once
// raceMinPlayers has joined — a no-op (silently ignored) for a public matchmade room, which has
// no host, or if requested too early/by the wrong client.
func (r *Room) handleStart(c *Client) {
	r.mu.Lock()
	if r.host == nil || c != r.host || r.state != roomWaiting || len(r.players) < raceMinPlayers {
		r.mu.Unlock()
		return
	}
	r.mu.Unlock()

	r.closeToNewJoiners()
	r.startCountdown()
}

func (r *Room) handleProgress(c *Client, wordIndex int) {
	r.mu.Lock()
	if r.state != roomRacing {
		r.mu.Unlock()
		return
	}
	state, ok := r.players[c]
	if !ok || state.finished {
		r.mu.Unlock()
		return
	}
	if wordIndex < 0 {
		wordIndex = 0
	}
	if wordIndex > r.wordCount {
		wordIndex = r.wordCount
	}
	state.wordIndex = wordIndex
	r.mu.Unlock()

	r.broadcastExcept(c, serverMessage{Type: "player_progress", PlayerID: c.id, WordIndex: wordIndex})
}

func (r *Room) handleFinish(c *Client, elapsedMs int64) {
	r.mu.Lock()
	if r.state != roomRacing {
		r.mu.Unlock()
		return
	}
	state, ok := r.players[c]
	if !ok || state.finished || elapsedMs <= 0 {
		r.mu.Unlock()
		return
	}

	state.finished = true
	state.elapsedMs = elapsedMs
	state.wordIndex = r.wordCount
	// wpm from the room's own authoritative word count and the reported elapsed time, not
	// whatever the client itself might claim its WPM to be — a small anti-cheat measure, and
	// also just the one place both numbers are guaranteed to agree.
	state.wpm = float64(r.wordCount) / (float64(elapsedMs) / 60000.0)
	r.finishedCount++
	state.rank = r.finishedCount
	allDone := r.allFinishedLocked()
	rank := state.rank
	wpm := state.wpm
	r.mu.Unlock()

	r.broadcast(serverMessage{
		Type:      "player_finished",
		PlayerID:  c.id,
		Rank:      rank,
		ElapsedMs: elapsedMs,
		WPM:       roundTo2(wpm),
	})

	if allDone {
		r.finishRace()
	}
}

// allFinishedLocked reports whether every still-connected player has finished — a disconnected
// player (see removeClient) never blocks this, since there's no way for them to ever finish.
// Must be called with mu held.
func (r *Room) allFinishedLocked() bool {
	if len(r.players) == 0 {
		return false
	}
	for _, state := range r.players {
		if state.connected && !state.finished {
			return false
		}
	}
	return true
}

// finishRace ends the race exactly once (whether triggered by everyone finishing or the
// raceMaxDuration timeout), broadcasts final standings, and closes every connection in the
// room — a fresh race is a fresh connection via the matchmaker, not a reused one.
func (r *Room) finishRace() {
	r.mu.Lock()
	if r.state == roomFinished {
		r.mu.Unlock()
		return
	}
	r.state = roomFinished
	if r.raceTimer != nil {
		r.raceTimer.Stop()
	}
	results := make([]playerResult, 0, len(r.players))
	unfinished := make([]playerResult, 0)
	for c, state := range r.players {
		res := playerResult{PlayerID: c.id, Rank: state.rank, ElapsedMs: state.elapsedMs, WPM: roundTo2(state.wpm)}
		if state.finished {
			results = append(results, res)
		} else {
			unfinished = append(unfinished, res)
		}
	}
	sort.Slice(results, func(i, j int) bool { return results[i].Rank < results[j].Rank })
	nextRank := len(results) + 1
	for i := range unfinished {
		unfinished[i].Rank = nextRank
		nextRank++
	}
	results = append(results, unfinished...)
	clients := make([]*Client, 0, len(r.players))
	for c := range r.players {
		clients = append(clients, c)
	}
	r.mu.Unlock()

	r.broadcast(serverMessage{Type: "race_end", Results: results})

	// Give writePump a moment to actually flush race_end before the connection closes —
	// closing send immediately after queuing a message races the write against the close.
	time.AfterFunc(writeWait, func() {
		for _, c := range clients {
			c.closeSend()
		}
	})
}

// broadcast sends msg to every player currently in the room.
func (r *Room) broadcast(msg serverMessage) {
	r.mu.Lock()
	clients := make([]*Client, 0, len(r.players))
	for c := range r.players {
		clients = append(clients, c)
	}
	r.mu.Unlock()
	for _, c := range clients {
		c.sendJSON(msg)
	}
}

// broadcastExcept is broadcast, skipping one client — used for progress updates, which are
// only meaningful to a player's *opponents*.
func (r *Room) broadcastExcept(except *Client, msg serverMessage) {
	r.mu.Lock()
	clients := make([]*Client, 0, len(r.players))
	for c := range r.players {
		if c != except {
			clients = append(clients, c)
		}
	}
	r.mu.Unlock()
	for _, c := range clients {
		c.sendJSON(msg)
	}
}

func (r *Room) playerCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.players)
}

func roundTo2(f float64) float64 {
	return float64(int(f*100+0.5)) / 100
}
