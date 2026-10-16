package main

// serverMessage is the one shape every server-to-client race message uses — a discriminated
// union via Type, with every other field optional (omitempty) and only meaningful for certain
// types. One struct rather than one type per message keeps the send call sites (race.go) simple
// at the cost of a wider struct; given how few fields there are and how short-lived each value
// is, that's a good trade.
//
// The full protocol, one entry per Type value:
//
//	→ client sends, ← server sends
//
//	← welcome        {playerId}                                   sent once, right after connecting
//	← host_assigned  {}                                            sent once, only to a private room's creator
//	← waiting        {code, playersInRoom, minPlayers, maxPlayers, players} lobby changed (code empty for public rooms)
//	→ start          {}                                            private-room host only: skip the wait, start now
//	← race_start     {quote, wordCount, startsInMs, players}       quote chosen, countdown begins
//	← go             {}                                            countdown elapsed, race is live
//	→ progress       {wordIndex}                                   "I've correctly typed this many words"
//	← player_progress {playerId, wordIndex}                        relayed to this player's opponents only
//	→ finish         {elapsedMs}                                   "I finished the quote in this long"
//	← player_finished {playerId, rank, elapsedMs, wpm}              relayed to the whole room, including the finisher
//	← player_left    {playerId}                                    an opponent disconnected mid-race
//	→ powerup        {powerup}                                     powerup rooms only: fire your powerup (once per race)
//	← powerup_used   {playerId, powerup, targets, freezeMs}         to the whole room: who it hit and for how long
//	← race_end       {results}                                     final standings; connection closes shortly after
//	← error          {message}                                     something went wrong (e.g. quote selection failed, unknown room code)
type serverMessage struct {
	Type string `json:"type"`

	PlayerID string `json:"playerId,omitempty"`

	// Code is a private room's share code — present on "waiting" only when the room is a
	// private lobby (see privateRooms.create), empty for a public matchmade room.
	Code          string `json:"code,omitempty"`
	PlayersInRoom int    `json:"playersInRoom,omitempty"`
	MinPlayers    int    `json:"minPlayers,omitempty"`
	MaxPlayers    int    `json:"maxPlayers,omitempty"`

	Quote      *TypingQuote `json:"quote,omitempty"`
	WordCount  int          `json:"wordCount,omitempty"`
	StartsInMs int64        `json:"startsInMs,omitempty"`

	WordIndex int `json:"wordIndex,omitempty"`

	Rank      int     `json:"rank,omitempty"`
	ElapsedMs int64   `json:"elapsedMs,omitempty"`
	WPM       float64 `json:"wpm,omitempty"`

	Results []playerResult `json:"results,omitempty"`

	// Players is everyone currently in the room, so clients can label opponents by name — sent
	// with "waiting" and "race_start".
	Players []playerInfo `json:"players,omitempty"`

	// Mode is the room's lobby mode ("classic" or "powerups"), sent with "waiting" and
	// "race_start".
	Mode string `json:"mode,omitempty"`

	// Powerup, Targets and FreezeMs describe a "powerup_used" event: who fired what (PlayerID,
	// Powerup), whose keyboards it freezes (Targets) and for how long.
	Powerup  string   `json:"powerup,omitempty"`
	Targets  []string `json:"targets,omitempty"`
	FreezeMs int64    `json:"freezeMs,omitempty"`

	Message string `json:"message,omitempty"`
}

// playerInfo identifies one player in a room. Name is whatever the client asked to be called
// when it connected (see sanitizeName) — unverified, since ws has no login of its own, so it's
// a display label only and never used to attribute results to an account.
type playerInfo struct {
	PlayerID string `json:"playerId"`
	Name     string `json:"name,omitempty"`
}

// playerResult is one player's line in a race_end message's final standings.
type playerResult struct {
	PlayerID  string  `json:"playerId"`
	Rank      int     `json:"rank"`
	ElapsedMs int64   `json:"elapsedMs"`
	WPM       float64 `json:"wpm"`
}
