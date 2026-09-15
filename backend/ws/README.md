# quotes-ws

A small Go WebSocket service that runs the real-time multiplayer typing race: auto-matchmaking into small lobbies (2-6 players) or a private lobby you share with specific friends by code, a synchronized countdown, live opponent progress, and final rankings — all in-memory, no persistence beyond picking each race's quote.

## Relationship to backend/api and backend/scraper

This is a **separate Go module** (its own `go.mod`), same pattern as `backend/api` — a small, independent service rather than a package inside a larger one.

- **Database**: points at the _same_ Postgres instance `backend/scraper` writes to and `backend/api` reads from (see `.env` — `DATABASE_URL`). This service only ever reads the `quotes` table (one query per race, to pick that race's passage) and never runs migrations.
- **Why a separate service from backend/api, not just another route there**: a WebSocket connection is long-lived (a whole lobby wait plus race, potentially several minutes) and stateful (each connection belongs to exactly one in-memory `Room`), which is a fundamentally different lifecycle from `backend/api`'s stateless, one-shot HTTP reads. Keeping them separate means either can be restarted, scaled, or deployed independently without the other's concerns leaking in (e.g. `backend/api`'s per-request rate limiter and this service's per-IP concurrent-connection cap are different problems with different shapes).
- **Process-local state**: matchmaking and room state live entirely in this process's memory. Running more than one replica of this service without a shared matchmaking layer in front would split players across independent instances that can never match each other — fine for a single instance, a real constraint if this ever needs to scale horizontally.

## Running it

```bash
go run .
```

Reads `.env` for `DATABASE_URL`, `WS_PORT` (default `8081`), and `CORS_ALLOWED_ORIGIN` (default `http://localhost:3000`). `.env` is optional — if it's just not present (e.g. running in a container, where config comes from the environment directly), that's not an error; only a genuinely malformed `.env` file that does exist is fatal.

## Connecting

| Endpoint                           | Puts you in...                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /ws/race`                     | The current public auto-matchmaking waiting room, or a fresh one if none is waiting                                |
| `GET /ws/private/create`           | A brand-new private room; you become its host and get a share `code` (in the `waiting` message) to send to friends |
| `GET /ws/private/join?code=ABC123` | The private room for `code`, if it's still open to new joiners — an `error` message and immediate close otherwise  |

All three are WebSocket upgrades and speak the same protocol from there on.

## Protocol

### Server → client messages

| `type`            | Fields                                              | When                                                                                                                      |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `welcome`         | `playerId`                                          | Immediately after the WebSocket upgrade completes                                                                         |
| `host_assigned`   | —                                                   | Sent once, only to the client that created a private room — the only client whose `start` message has any effect          |
| `waiting`         | `code`, `playersInRoom`, `minPlayers`, `maxPlayers` | On join, and whenever the room's player count changes while waiting (`code` empty for a public room)                      |
| `race_start`      | `quote`, `wordCount`, `startsInMs`                  | Once the room has enough players and stops accepting new joiners                                                          |
| `go`              | —                                                   | `startsInMs` after `race_start` — the race actually begins                                                                |
| `player_progress` | `playerId`, `wordIndex`                             | An opponent's live progress (never echoed back to that player)                                                            |
| `player_finished` | `playerId`, `rank`, `elapsedMs`, `wpm`              | A player finishes typing the quote                                                                                        |
| `player_left`     | `playerId`                                          | A player disconnects mid-race                                                                                             |
| `race_end`        | `results` (`[{playerId, rank, elapsedMs, wpm}]`)    | Every connected player has finished, or `raceMaxDuration` elapses                                                         |
| `error`           | `message`                                           | The room couldn't start (e.g. no eligible quote found), or a private-room join failed (e.g. unknown/already-started code) |

### Client → server messages

| `type`     | Fields      | Meaning                                                                                                                                                                        |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `progress` | `wordIndex` | "I'm now at word N" — purely cosmetic, for opponents' UI                                                                                                                       |
| `finish`   | `elapsedMs` | "I finished the quote in this many milliseconds"                                                                                                                               |
| `start`    | —           | Private-room host only: skip the wait and start now (requires at least `minPlayers` already joined; ignored from anyone else, on a public room, or before `minPlayers` is met) |

`wpm` is always computed server-side from the room's own authoritative word count and the client-reported `elapsedMs` — never trusted as a value the client sends directly.

## Matchmaking rules

- A room needs at least 2 players to race, and holds at most 6.
- Once 2 players have joined, the room waits up to 15s for more before starting anyway — or the private room's host can send `start` to begin immediately instead of waiting.
- Reaching 6 players starts the room immediately, without waiting.
- A player who disconnects during the wait is removed outright; a player who disconnects mid-race stays in the final results as unfinished, and stops blocking the race from ending once everyone still connected has finished.
- A private room's share code stops resolving (`/ws/private/join` returns "room not found") as soon as the room stops accepting new joiners — whether because it started or because everyone left — so a stale link can't seat someone into a race already underway.

## Concurrent-connection limiting

Unlike `backend/api`'s per-request rate limiter, a WebSocket connection is long-lived rather than a discrete request — so abuse control here is a per-IP cap on _concurrently open_ connections (see `ws.go`), not a request-rate token bucket.

## Endpoints

### `GET /ws/race`, `GET /ws/private/create`, `GET /ws/private/join?code=...`

WebSocket upgrades — see Connecting/Protocol above.

### `GET /health`

`200 {"status": "ok"}` if Postgres is reachable, `503` otherwise.
