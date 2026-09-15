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
//	← waiting        {code, playersInRoom, minPlayers, maxPlayers} lobby size changed (code empty for public rooms)
//	→ start          {}                                            private-room host only: skip the wait, start now
//	← race_start     {quote, wordCount, startsInMs}                quote chosen, countdown begins
//	← go             {}                                            countdown elapsed, race is live
//	→ progress       {wordIndex}                                   "I've correctly typed this many words"
//	← player_progress {playerId, wordIndex}                        relayed to this player's opponents only
//	→ finish         {elapsedMs}                                   "I finished the quote in this long"
//	← player_finished {playerId, rank, elapsedMs, wpm}              relayed to the whole room, including the finisher
//	← player_left    {playerId}                                    an opponent disconnected mid-race
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

	Message string `json:"message,omitempty"`
}

// playerResult is one player's line in a race_end message's final standings.
type playerResult struct {
	PlayerID  string  `json:"playerId"`
	Rank      int     `json:"rank"`
	ElapsedMs int64   `json:"elapsedMs"`
	WPM       float64 `json:"wpm"`
}
