# Vroomy

**A real-time multiplayer typing-race game.** Every racer gets the same passage, a synchronized
countdown fires, and each car moves across the track only as fast as its driver types _correctly_.
Race AI bots solo, get auto-matched against other players, or open a private room and send the
code to friends.

The passages aren't a hand-written word list. They're real quotes from a crawler I built
separately ([`quotes-crawler`](#related-project-quotes-crawler)), which cleans, deduplicates and
scores them for whether they work in a typing race. Vroomy reads that corpus straight from
Postgres.

---

## Features

- **Solo vs. AI.** Pick a bot speed tier and race with live WPM and accuracy gauges.
- **Multiplayer matchmaking.** Auto-matched lobbies of 2–6 players over WebSockets, with a
  server-driven countdown, live opponent progress, player names and server-computed final
  rankings.
- **Private rooms.** Create a room, share a 6-character code, and start whenever you're ready.
  The host can skip the wait.
- **Daily challenge.** One real quote per day, the same for every player, with streaks, a
  personal best and recent history.
- **Leaderboards.** Top speed over the last 24 hours, 7 days or all time, plus a board for each
  day's challenge. Each one can show everyone or just you and your friends, and every row links
  to the replay of the run that earned it.
- **Replays.** Every race is recorded keystroke by keystroke and can be played back on the real
  race track at 1×, 2× or 4×, with a scrubber.
- **Friends.** Search players by name, send and accept requests, then compare on the friends
  leaderboard or start a private race together.
- **Accounts (OIDC).** Log in through a self-hosted Keycloak. Your race history, replays, daily
  results and cosmetics are stored server-side. Guests get the full game on localStorage, and
  everything they played gets imported the first time they log in.
- **Garage shop.** Every finished race pays coins (more for speed and podiums); spend them on
  29 cars, trails, underglow and power-ups. For logged-in players the server awards the coins and
  prices every purchase, so balances can't be edited from the browser.
- **Power-ups.** One per race, fired with Tab whenever you choose: Boost, Nitro, Shell,
  Magnet, EMP, or the Nuke. Solo races always have them; for multiplayer and friends rooms you
  pick a Classic or Power-ups lobby, and against real people attacks freeze the target's
  keyboard briefly instead of deleting their typing.
- **Achievements.** Milestones for speed, accuracy, streaks and podiums.
- **Typing guide.** Drills with an on-screen keyboard for practicing technique.

## Tech stack

| Layer          | Technology                                                                       |
| -------------- | -------------------------------------------------------------------------------- |
| Frontend       | React 19, TanStack Start (SSR, Router, Query), TypeScript, Tailwind CSS v4, Vite |
| REST API       | Go, `net/http` (Go 1.22+ routing), `pgx` connection pool, `goose` migrations     |
| Real-time      | Go, `gorilla/websocket`, in-memory matchmaking and room state                    |
| Data           | PostgreSQL, shared with the quote crawler                                        |
| Auth           | OpenID Connect (Keycloak), sealed server-side session cookie, `jose` for JWTs    |
| Infrastructure | Docker, Docker Compose, Dokploy/Traefik, Caddy configs for plain-VPS deploys     |
| Tooling        | Bun, ESLint, Prettier, Husky + lint-staged                                       |

## Architecture

```
                 ┌──────────────────────────────┐
  Browser ──────►│  frontend (TanStack Start)   │
     │   HTTPS   │  SSR + server functions      │
     │           └──────────────┬───────────────┘
     │                          │ internal network only
     │                          │ (identity forwarded as headers)
     │                          ▼
     │           ┌──────────────────────────────┐
     │           │  api (Go)                    │─────┐
     │           │  quotes, races, leaderboards │     │
     │           └──────────────────────────────┘     ▼
     │   WSS     ┌──────────────────────────────┐   ┌────────────┐
     └──────────►│  ws (Go)                     │──►│ PostgreSQL │◄── quotes-crawler
                 │  matchmaking, live races     │   └────────────┘    (separate repo)
                 └──────────────────────────────┘
```

- **`api` has no public URL.** The browser never talks to it directly. The frontend's own server
  calls it over the internal Docker network through TanStack `createServerFn` handlers. That
  means the API only accepts traffic from the frontend, and authenticated calls can carry
  identity headers that only the frontend server sets, after it has verified the session.
- **`ws` is a separate service from `api`.** A WebSocket connection is long-lived and stateful,
  while `api` handles short, stateless requests. Keeping them apart means each can be restarted,
  scaled and rate-limited on its own terms. `api` uses per-IP token buckets; `ws` caps how many
  connections one IP can hold open at once.
- **The database is the only thing shared with the crawler.** `quotes-crawler` owns and migrates
  the `quotes` table. Vroomy's services only read it and keep their own tables (`users`,
  `race_results`, `daily_quotes`, `daily_results`, `friendships`) under a separate migration
  history.

## Engineering highlights

A few decisions I'd point a reviewer to:

- **Random selection without a full-table sort**
  ([`backend/api/quotes.go`](backend/api/quotes.go)). `ORDER BY random()` sorts every candidate
  row on every request. Instead, the API picks a random starting id and does a primary-key range
  scan with the filters, wrapping around if nothing matches. That costs O(log N) on a corpus that
  is designed to grow to hundreds of thousands of rows.
- **A daily passage that stays fixed while the corpus grows**
  ([`backend/api/daily.go`](backend/api/daily.go)). The first request for a day picks a quote and
  stores it in `daily_quotes`. If several first requests arrive at once, an
  `ON CONFLICT DO NOTHING` insert lets exactly one win, and they all read back the same row. The API accepts the
  player's local date, so the challenge rolls over at the player's midnight. It rejects any date
  that can't be "today" somewhere on Earth, so nobody can peek at tomorrow's passage.
- **Replays in a few KB**
  ([`backend/api/replays.go`](backend/api/replays.go),
  [`frontend/src/lib/replay/`](frontend/src/lib/replay)). The game only ever accepts correct
  characters, so what a player had typed at any moment is always a prefix of the passage. A
  replay therefore stores `[ms, typedLength, rejected]` per keystroke instead of the text, and
  the player rebuilds every frame (caret, word, live WPM, typo flashes) from that one number.
  The server checks every replay is internally consistent before storing it.
- **Leaderboards in one query each**
  ([`backend/api/leaderboard.go`](backend/api/leaderboard.go)). `DISTINCT ON` picks each
  player's best race in the window, `RANK()` handles ties, and the same query returns the top 50
  plus the caller's own row wherever it falls. The friends board is the same SQL with one extra
  filter, not a separate code path.
- **The server decides multiplayer results**
  ([`backend/ws/race.go`](backend/ws/race.go)). WPM is computed on the server from the room's own
  word count and the elapsed time. A client never reports its own WPM in a multiplayer race, so
  it can't make up a score that changes another player's ranking.
- **Typing input that can't be gamed**
  ([`frontend/src/lib/typing/useTypingRace.ts`](frontend/src/lib/typing/useTypingRace.ts)). Your
  car only moves for correctly typed characters. A word locks once you commit it, and holding
  down one key or typing past the end of a word doesn't move you forward.
- **Text normalized for typing**
  ([`backend/api/typingsafe.go`](backend/api/typingsafe.go)). Curly quotes, em dashes and
  ellipses are converted to ASCII, because a quarter of the corpus contains characters players
  can't easily type. Accented letters are left alone.
- **Works even when the backend doesn't.** If the API is down, solo races and the daily
  challenge use a local passage pool instead, so a backend problem never stops a race from
  starting.
- **OIDC implemented directly**
  ([`frontend/src/lib/auth/`](frontend/src/lib/auth)). The code reads the provider's discovery
  document and verifies tokens with `jose`, with no vendor SDK. It works against any standard
  OIDC provider.

## Running locally

**Prerequisites:** [Bun](https://bun.com/), Go 1.26+, Docker.

1. **Database and quotes.** Start Postgres from `quotes-crawler`'s `docker-compose.dev.yml`
   (port `55432`) and run the crawler once, so the `quotes` table exists and has data in it.
2. **API**
   ```bash
   cd backend/api
   cp .env.example .env
   go run .            # :8080, runs its own migrations on startup
   ```
3. **WebSocket server**
   ```bash
   cd backend/ws
   cp .env.example .env
   go run .            # :8081
   ```
4. **Frontend**
   ```bash
   cd frontend
   bun install
   bun --bun run dev   # http://localhost:3000
   ```
   Logging in also needs `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `PUBLIC_URL` and
   `SESSION_SECRET` in `frontend/.env`. Everything else works without an account.

**Tests:** `go test ./...` in `backend/api` and `backend/ws`.

## Deployment

The `docker-compose.yml` at the repo root deploys `frontend`, `api` and `ws` together as one
Compose project, against a Postgres instance that already exists (configured via
`DATABASE_URL`). They have to be deployed together, because that's the only way the frontend can
reach `api` by its internal name (`http://api:8080`) while `api` gets no public domain. Every
required environment variable is documented at the top of that file, and `.env.example` covers
plain `docker compose --env-file .env.prod up -d` deploys.

## Project structure

```
vroomy/
├── frontend/          TanStack Start app: UI, game logic, auth, server-side API proxy
├── backend/
│   ├── api/           Go REST API: quotes, daily challenge, users, race history
│   └── ws/            Go WebSocket server: matchmaking, private rooms, live races
└── docker-compose.yml Production stack
```

Each service has its own README with protocol and endpoint details:
[`backend/api`](backend/api/README.md), [`backend/ws`](backend/ws/README.md).

## Related project: quotes-crawler

The passages come from `quotes-crawler`, a separate Go service with a Redis-backed URL frontier.
It crawls quote sources, normalizes and deduplicates what it finds, and marks each quote as
suitable or not for a typing race. It's a separate repo because it has its own lifecycle,
deployment and scaling needs. The shared database is the only connection between the two.

## Known limitations

- **Solo leaderboard scores are bounds-checked, not proven.** Solo and daily races run in the
  browser, so their WPM is reported by the client. The API rejects impossible values and
  inconsistent replays, but a determined cheater could still forge a plausible run. That's an
  acceptable trade-off for a bragging-rights board; a replay-verifying server would be the fix.
- **One `ws` instance.** Matchmaking state lives in memory, so scaling `ws` horizontally would
  need a shared matchmaking layer (e.g. Redis) in front.
- **`ws` has its own public domain.** The browser connects to it directly instead of through the
  frontend, unlike `api`. Proxying WebSockets through the frontend server would leave the browser
  with a single origin to talk to.
