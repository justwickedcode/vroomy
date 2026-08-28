# Vroomy

A multiplayer typing-race game. Sentences race by like laps on a track — the
faster and more accurately you type, the faster your car moves. Race solo
against AI bots, or (once multiplayer ships) against real people in real
time. The word pool is meant to be fed by a self-hosted quote-scraping
pipeline instead of a static, hand-written list.

This document is the single source of truth for **how the whole system is
meant to fit together** — what exists today, what's still a stub, and the
concrete, detailed plan for turning the three disconnected pieces in this
repo into one product: schemas, API contracts, wire protocols, failure
modes, security posture, deployment topology, all of it. It is a planning
document, not a changelog — nothing here has been implemented as a result of
writing it, and every schema/contract below is a proposal to review, not
something already running.

> For local dev quick-start, see the "For Max" notes at the very bottom.
> Everything above that is architecture and planning.

**Table of contents**

1. [What Vroomy actually is](#1-what-vroomy-actually-is)
2. [Repo shape](#2-repo-shape)
3. [Target architecture](#3-target-architecture)
4. [Current state, service by service](#4-current-state-service-by-service)
5. [Database design](#5-database-design)
6. [`api` — REST contract](#6-api--rest-contract)
7. [`ws` — real-time protocol](#7-ws--real-time-protocol)
8. [Matchmaking & room lifecycle](#8-matchmaking--room-lifecycle)
9. [Anti-cheat & server authority](#9-anti-cheat--server-authority)
10. [Scraper deep plan](#10-scraper-deep-plan)
11. [Frontend integration plan](#11-frontend-integration-plan)
12. [Security](#12-security)
13. [Deployment & infrastructure](#13-deployment--infrastructure)
14. [Observability](#14-observability)
15. [CI/CD](#15-cicd)
16. [Testing strategy](#16-testing-strategy)
17. [Monorepo tooling](#17-monorepo-tooling)
18. [Phased roadmap](#18-phased-roadmap)
19. [Open questions & risks](#19-open-questions--risks)

---

## 1. What Vroomy actually is

- **The core loop:** a passage of text appears, a countdown fires, everyone
  racing (you + bots today, you + other humans eventually) starts typing at
  the same instant, and a car per racer crawls across a track proportional to
  how much of the text they've typed _correctly_. First car to the finish
  line wins.
- **Solo vs AI** (implemented today, frontend-only): pick a bot speed
  tier, race a single simulated opponent, see your placement.
- **Multiplayer** (UI stub only — "coming soon"): the real design intent,
  per an in-code comment in `TypingRace.tsx`, is that races start from a
  **server-broadcast event** — every player in a room gets the same
  countdown at once. Nobody clicks "ready"; the room decides.
- **Content pipeline:** instead of a fixed sentence list, passages should
  come from a scraped, deduplicated corpus of real quotes (`backend/scraper`),
  served to the frontend through a REST API (`backend/api`).
- **Product pillars this plan optimizes for**, in priority order:
  1. Solo play must never depend on the network — it's the fallback when
     multiplayer, `api`, or `ws` is degraded/down.
  2. Race results must be trustworthy — no client can fake WPM in a way
     that affects another player's outcome.
  3. Content pipeline runs unattended and never blocks the product — if the
     scraper stalls, `/quotes/random` still serves from whatever's already
     in Postgres.
  4. Everything ships in stages that are independently useful (see
     [§18](#18-phased-roadmap)) — no phase requires a later phase to be
     valuable.

## 2. Repo shape

```
vroomy/
├── frontend/            TanStack Start app — the only thing that runs today
├── backend/
│   ├── scraper/         Go crawler — the only backend service with real code
│   ├── api/             REST API — currently just notes + a docker-compose.yml
│   └── ws/               WebSocket server — currently just a TODO
├── package.json          root: husky + lint-staged + prettier only (no workspaces)
└── README.md              this file
```

This is **not** a wired-up monorepo yet — the root `package.json` has no
`workspaces` field, `frontend/` and `backend/*` each have their own
lockfiles/dependency trees, and nothing currently talks to anything else over
the network. Three services are drawn in the architecture below; only one
(`scraper`) has real logic behind it, and even that isn't consumed by
anything. [§17](#17-monorepo-tooling) plans how this becomes a real monorepo.

## 3. Target architecture

```
                         ┌───────────────────────────┐
                         │        frontend            │
                         │  TanStack Start (React 19) │
                         │  - race UI, typing engine  │
                         │  - REST calls  (fetch text) │
                         │  - WS client   (live races) │
                         └──────────┬──────────┬───────┘
                                    │          │
                       REST (JSON)  │          │  WebSocket (wss://)
                                    ▼          ▼
                    ┌───────────────────┐  ┌───────────────────────┐
                    │      api          │  │          ws            │
                    │  Hono + Zod       │  │  ws (raw) + Zod         │
                    │  - quotes, users,  │  │  - room/lobby state     │
                    │    races, scores   │  │  - countdown broadcast  │
                    │  - auth (future)   │  │  - progress relay        │
                    └─────────┬─────────┘  │  - server-authoritative  │
                              │             │    finish detection      │
                              │             └───────────┬─────────────┘
                              │                          │
                              ▼                          ▼
                    ┌────────────────────────────────────────┐
                    │              PostgreSQL                  │
                    │  quotes, url_frontier (scraper-owned)     │
                    │  users, races, race_participants,         │
                    │  refresh_tokens (api-owned)                │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▲
                    ┌───────────────────┴────────────────────┐
                    │              scraper (Go)                │
                    │  cmd/crawler → internal/{crawler,fetcher, │
                    │  parser,dedup,scoring,db}                 │
                    │  - crawls quote sources, dedups, writes    │
                    │    into `quotes` — runs standalone,        │
                    │    on a schedule, not request-driven       │
                    └───────────────────┬────────────────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │       Redis         │
                              │  DB0: scraper LSH    │
                              │       bands + frontier │
                              │  DB1: ws room/presence │
                              │       state + pub/sub  │
                              └──────────────────┘
```

**Data direction is one-way for content:** `scraper` → Postgres `quotes`
table → `api` reads from it → `frontend` fetches passages. The scraper never
talks to `api` or `ws` directly; it's a batch/background job that keeps the
`quotes` table full. `ws` never talks to Postgres directly either — it asks
`api` for a passage over an internal HTTP call (or a small in-process client
library, see [§8.2](#82-passage-selection)) so `quotes` has exactly one
reader path to reason about. `api` and `ws` are the only two services the
frontend talks to at runtime, and `ws` is the only service with per-room
in-memory state (backed by Redis so a room survives a single `ws` instance
restart — see [§8.4](#84-horizontal-scaling--multi-instance-ws)).

## 4. Current state, service by service

### 4.1 `frontend/` — the only runnable piece today

**Stack:** TanStack Start (React 19 + TanStack Router, file-based routing) on
Vite, TanStack Query wired but unused, Tailwind v4 (CSS-variable theme, OKLCH
colors, light/dark via `prefers-color-scheme`), shadcn-style primitives
(`button`, `badge`, `card`), Nitro as the deploy target, `bun` as the package
manager. Path alias `#/*` → `src/*`.

**What's built, concretely:**

| File                                                                | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/typing/useTypingRace.ts`                                   | The typing engine. Word-locked input model: a word only "commits" on a correct space-terminated match; committed words can't be edited again (matches TypeRacer, not Monkeytype). Computes WPM from _correctly committed characters only_ (no partial credit for a word typed wrong elsewhere), gated behind a 1.5s minimum elapsed time so early jitter doesn't spike the number. Progress (and therefore car position) only advances on a verified-correct prefix — there's no way to fake forward motion. Backspacing can't reach into an already-committed word. Overflow past a word is capped at 20 extra characters so a stuck key can't runaway-allocate memory into `typed`. |
| `src/lib/typing/useBotRacers.ts`                                    | Simulated AI opponents. Given a WPM range, generates N bots with a per-bot random base speed and a sinusoidal "wobble" so they don't move at a robotic constant rate. Explicitly commented as a placeholder for backend-driven multiplayer.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/lib/typing/sentences.ts`                                       | Static 8-sentence pool, deliberately long (~35–45 words) because short passages make WPM numerically unstable. Explicitly commented as a placeholder for the scraper-fed API.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/components/typing/TypingRace.tsx`                              | Top-level race screen: renders the word stream with per-character correct/incorrect/pending styling, a blinking caret positioned via a DOM marker + `getBoundingClientRect`, the countdown lock phase (`waiting` → `counting` → `ready`), the finish-state summary card.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/components/typing/RaceSetup.tsx`                               | Pre-race flow: mode picker (Solo vs AI / Multiplayer), then speed-tier picker for solo. Multiplayer step is a static "coming soon" placeholder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/components/typing/RaceTrack.tsx` / `CarIcon.tsx` / `Gauge.tsx` | Presentational: per-lane progress bar + car position, WPM/accuracy/time gauges in the header. `Racer` interface is already opponent-source-agnostic (`id`, `name`, `progress`, `wpm`, `finished`, optional `color`/`isYou`) — bots and future remote players are structurally the same shape, so this layer needs no rewrite for multiplayer.                                                                                                                                                                                                                                                                                                                                         |

**What's explicitly not wired up:**

- TanStack Query's `QueryClient` is constructed and passed through router
  context, and `TanstackQueryProvider` exists — but no query/mutation anywhere
  in the app actually uses it yet. There is no `fetch` call to any backend in
  the entire frontend.
- No WebSocket client exists anywhere.
- No routes exist besides `/` (`src/routes/index.tsx`). No auth pages, no
  leaderboard, no multiplayer lobby route.
- No environment-based API base URL config (no `.env`, no `import.meta.env`
  usage anywhere in `frontend/src`).

### 4.2 `backend/scraper/` — the only backend service with real logic

Go module `quotes-crawler`. This is the furthest-along piece of the backend
and the most important one to understand because it defines the _shape_ of
the content the frontend will eventually consume.

**Package layout** (`internal/`):

- `crawler` — orchestration (`Crawler.Run`, `Crawler.SeedFrontier`).
- `fetcher` — a bare `net/http` GET with a custom User-Agent. No retries,
  no rate limiting, no timeout set on the `http.Client` yet (despite the
  scraper README claiming rate limiting is done — verify before relying on
  that claim; see [§10.2](#102-politeness--rate-limiting-highest-priority-gap)).
- `parser` — a `Parser` interface (`Parse(html string) (Result, error)`
  returning both extracted quotes _and_ discovered next-page URLs, so
  crawling and pagination share one call). Implementations: `ToscrapeParser`
  (works, sandbox-only target), `WikiquotesParser` (empty stub, commented
  out), **no BrainyQuote parser yet** despite BrainyQuote being the only
  seeded source.
- `dedup` — two-layer duplicate detection: exact match via SHA256 of a
  normalized string (`ON CONFLICT (sha256_hash) DO NOTHING` at the DB layer),
  near-duplicate match via 64-bit Simhash + 4×16-bit LSH banding in Redis, so
  a new quote only needs Hamming-distance comparison against same-band
  candidates instead of the whole corpus.
- `scoring` — `CalculatePriority(source, depth, errorCount)`: lower score
  crawls sooner. Per-source base score (`brainyquote`=5.0, `quotable`=1.0,
  `goodreads`=20.0, unknown=1000.0) plus depth and error penalties.
- `db` — Postgres (via `pgxpool`) as source of truth, Redis as a warm
  working cache for both the dedup index and the crawl frontier (a sorted
  set used as a priority queue: `ZADD`/`ZPOPMIN`). On every startup, both
  caches are rebuilt from Postgres (`WarmSimhashCache`, `WarmFrontierCache`)
  — Redis holds no state that isn't recoverable from Postgres.

**Schema today** (`internal/db/migrations/`, managed with Goose):

```
quotes: id, text, author, tags, source, sha256_hash (unique), simhash, created_at
url_frontier: id, url (unique), source, priority, depth,
              status (pending | in_progress | done | failed), error_count,
              last_crawled_at, created_at
```

**Actual runtime state right now** (per `handoff.md` and a direct read of
`crawler.go`): the crawl loop seeds one BrainyQuote URL, pops it, fetches it,
then **hardcodes a call to `ToscrapeParser`** regardless of source (there's a
`// brainy not implemented` comment marking this as known-wrong) — so every
real crawl attempt fails to parse and the URL gets marked `failed`. The
frontier then empties and the loop just sleeps in 5s intervals forever. The
crawler currently cannot produce a single real quote end-to-end. Additionally,
`Run()` discards the parsed `Result` entirely (`_, err = ...`) even where
parsing _does_ succeed — nothing calls `store.SaveQuote` from inside the loop
today, so even fixing the dispatch bug alone would not yet persist quotes.

**Sources table** (from the scraper's own README): only `quotes.toscrape.com`
(sandbox, not a real target) is actually done. Quotable API was dropped
(service permanently down). BrainyQuote, Wikiquote, GoodReads, and a Kaggle
CSV import are all still planned.

### 4.3 `backend/api/` — not started

Contains only a README of options ("thinking about Elysia or Hono"), a
`docker-compose.yml` that spins up a bare Postgres 16 container, and an
`.env`. **No framework has been chosen, no server code exists.** This
service's entire job in the target architecture is to be the thing the
frontend actually calls: serve quote passages, and eventually own
accounts/races/leaderboards. [§6](#6-api--rest-contract) below picks a
framework and specifies the full contract.

### 4.4 `backend/ws/` — not started

README is a single TODO line suggesting `socket.io`. No code, no
docker-compose, no schema. This is the service responsible for the
"server-broadcast countdown, everyone starts together" behavior that
`TypingRace.tsx` already assumes and comments about, but currently fakes
client-side with a `setTimeout`. [§7](#7-ws--real-time-protocol) below
specifies the full protocol.

---

## 5. Database design

One Postgres instance, one root-level `docker-compose.yml` (see
[§13.1](#131-unifying-the-two-docker-composes)) — not the two independent,
port-colliding Postgres containers that exist today in `backend/api/` and
`backend/scraper/`. Two ownership zones inside the same database, enforced
by convention (and, if this ever needs hardening, Postgres role grants):

- **`scraper` owns and is the sole writer of** `quotes`, `url_frontier`.
- **`api` owns and is the sole writer of** `users`, `refresh_tokens`,
  `races`, `race_participants`. `api` only ever _reads_ `quotes` — it never
  writes to a scraper-owned table.

### 5.1 Scraper-owned tables (already exist, documented for completeness)

`quotes` (already migrated via Goose):

| Field         | Type       | Notes                                                |
| ------------- | ---------- | ---------------------------------------------------- |
| `id`          | id         | primary key                                          |
| `text`        | text       | the passage itself                                   |
| `author`      | string     | nullable                                             |
| `tags`        | JSON       |                                                      |
| `source`      | string     | which crawler source produced it, e.g. `brainyquote` |
| `sha256_hash` | string     | unique — exact-duplicate fingerprint                 |
| `simhash`     | 64-bit int | near-duplicate fingerprint                           |
| `created_at`  | timestamp  |                                                      |

`url_frontier` (already migrated, full field list in
`backend/scraper/README.md`) — the crawl priority queue: url, source,
priority, depth, a `pending`/`in_progress`/`done`/`failed` status, error
count, timestamps.

**Planned addition — quote quality gating for `api` consumption.** Not every
scraped row is race-ready (too short, too long, contains markup artifacts,
non-English, etc.). Rather than filter at query time on every
`/quotes/random` call, add two new fields to `quotes` that the scraper (or a
small one-off backfill job) populates once, at insert time, and index the
new flag so filtering on it stays cheap:

| New field    | Type    | Notes                                       |
| ------------ | ------- | ------------------------------------------- |
| `word_count` | int     | computed from `text`                        |
| `race_ready` | boolean | default `false`; indexed for fast filtering |

`race_ready` is computed from simple rules matching what `sentences.ts`
already assumes implicitly (35–45 words is the sweet spot the frontend's
WPM-stability comment calls out, but the gate should be a _range_, not that
exact bucket, or the pool stays tiny): word count falls within roughly
15–60, the text is free of control characters or unbalanced quote marks,
and an author is present.

`api`'s `/quotes/random` (see [§6.2](#62-get-quotesrandom)) filters on
`race_ready = TRUE` only, so a partial URL scraped mid-sentence or a
one-word stub never reaches a player mid-race.

### 5.2 `api`-owned tables (new, this is the actual planning work)

**`users`** — created lazily. A player can race anonymously; an account
just persists identity across sessions/devices for leaderboards & history.

| Field                        | Type         | Notes                                      |
| ---------------------------- | ------------ | ------------------------------------------ |
| `id`                         | id           | primary key                                |
| `display_name`               | string (≤32) |                                            |
| `email`                      | string       | unique, nullable — null for guest accounts |
| `password_hash`              | string       | nullable — null for guest accounts         |
| `is_guest`                   | boolean      | default true                               |
| `created_at`, `last_seen_at` | timestamp    |                                            |

Indexed on `email` (for lookups where it's set).

**`refresh_tokens`** — opaque, rotating, hashed at rest; see §12.3 for the
full auth flow this table supports.

| Field        | Type      | Notes                                                       |
| ------------ | --------- | ----------------------------------------------------------- |
| `id`         | id        | primary key                                                 |
| `user_id`    | id        | references `users`, cascades on delete                      |
| `token_hash` | string    | hash of the raw token; the raw token itself is never stored |
| `expires_at` | timestamp |                                                             |
| `revoked_at` | timestamp | nullable                                                    |
| `created_at` | timestamp |                                                             |

Indexed on `user_id`.

**`races`** — one row per completed race (solo or multiplayer). Solo-vs-AI
races are only persisted once accounts exist and the player opts in — see
Phase 5 in §18; the schema supports it from day one so there's no later
migration to retrofit "was this solo or multiplayer" onto history.

| Field                    | Type        | Notes                                                                                                                         |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | id          | primary key                                                                                                                   |
| `quote_id`               | id          | references the scraper's `quotes.id` **by convention only** — no DB-level foreign key across ownership zones (see note below) |
| `mode`                   | enum        | `solo` \| `multiplayer`                                                                                                       |
| `room_code`              | string (≤8) | nullable — null for solo                                                                                                      |
| `started_at`, `ended_at` | timestamp   |                                                                                                                               |
| `created_at`             | timestamp   |                                                                                                                               |

Indexed on `room_code` (where set).

**`race_participants`** — one row per player per race, including bots
(`is_bot = true`, `user_id` empty) so leaderboards can join purely on
human participants without a separate table shape for solo races.

| Field          | Type            | Notes                                                           |
| -------------- | --------------- | --------------------------------------------------------------- |
| `id`           | id              | primary key                                                     |
| `race_id`      | id              | references `races`, cascades on delete                          |
| `user_id`      | id              | references `users`, nullable — empty if bot or guest-no-account |
| `is_bot`       | boolean         | default false                                                   |
| `display_name` | string (≤32)    | snapshot at race time, survives later name changes              |
| `wpm`          | int             |                                                                 |
| `accuracy`     | decimal (0–100) |                                                                 |
| `placement`    | int             | 1 = first place                                                 |
| `finished`     | boolean         | false if the player left/DNF'd                                  |
| `created_at`   | timestamp       |                                                                 |

Indexed on `race_id`, and on `user_id` (where set).

**Why no DB-level foreign key from `races.quote_id` to `quotes.id`:**
cross-schema/cross-ownership FKs create exactly the kind of coupling
[§5](#5-database-design)'s ownership split is trying to avoid — a scraper
migration that ever needs to `DROP`/rebuild `quotes` (e.g. a dedup-scheme
change) shouldn't be blocked by `api`'s foreign keys. Referential integrity
here is enforced at the application layer (`api` validates `quote_id` exists
via a read query before writing a `race` row) instead. If both tables ever
move into truly separate databases (see [§19](#19-open-questions--risks)),
this decision is what makes that split painless later.

**Leaderboard is a derived view, not a table** — it's fully computable from
`race_participants` and would otherwise drift out of sync if stored
separately. For each human, non-bot user with at least one finished race, it
aggregates: races played, average WPM, best WPM, average accuracy, and win
count (races where `placement = 1`) — grouped by user.

### 5.3 Migration ownership

Each service keeps its own migration tool against its own tables — no shared
migration runner:

- `scraper` keeps Goose, unchanged.
- `api` gets its own migration tool scoped to `users`, `refresh_tokens`,
  `races`, `race_participants` only (Drizzle Kit is the natural fit if `api`
  is TypeScript — see [§6.1](#61-framework-choice)). Both run against the
  same physical database but never touch each other's tables, so migration
  ordering between the two services never matters.

---

## 6. `api` — REST contract

### 6.1 Framework choice

**Recommendation: Hono**, over Elysia, for one concrete reason: Hono is
runtime-agnostic (works identically on Node, Bun, or edge runtimes), which
matters here because `frontend`'s Nitro deploy target is also
runtime-flexible — keeping `api` portable to whatever host is picked in
[§13](#13-deployment--infrastructure) avoids a Bun-only lock-in that Elysia
currently implies. Pair it with `zod` for request/response schema validation
(`@hono/zod-validator`) so every endpoint below has a runtime-enforced
contract, not just a TypeScript compile-time one — the frontend currently
has zero runtime response validation anywhere, and that gap should close
here rather than propagate into a second service.

**Directory shape** (proposed, mirrors `frontend/src` conventions):

```
backend/api/
├── src/
│   ├── index.ts              entrypoint, mounts routes, starts server
│   ├── db/
│   │   ├── schema.ts          Drizzle schema for users/refresh_tokens/races/race_participants
│   │   └── client.ts          pgPool/drizzle client, reads DATABASE_URL
│   ├── routes/
│   │   ├── quotes.ts
│   │   ├── races.ts
│   │   ├── leaderboard.ts
│   │   └── auth.ts
│   ├── middleware/
│   │   ├── auth.ts             verifies JWT, attaches req.user
│   │   └── rateLimit.ts
│   └── lib/
│       └── errors.ts           shared error envelope helpers (§6.5)
├── drizzle/                    generated migrations
├── package.json
└── Dockerfile
```

### 6.2 `GET /quotes/random`

Replaces `getRandomSentence()` in `frontend/src/lib/typing/sentences.ts`.

Query params:
| Param | Type | Default | Notes |
|---|---|---|---|
| `exclude` | `number` (quote id) | none | mirrors the existing "don't repeat the last sentence" behavior in `reset()` |
| `minWords` | `number` | `15` | |
| `maxWords` | `number` | `60` | |

```
GET /quotes/random?exclude=482

200 OK
{
  "id": 913,
  "text": "Racing against the clock is the only way to know...",
  "author": "Anonymous",
  "wordCount": 41
}

404 Not Found   -- pool is empty (fresh install, scraper hasn't run yet)
{ "error": { "code": "NO_QUOTES_AVAILABLE", "message": "..." } }
```

Selection logic: pick one row at random from `quotes` where `race_ready` is
true, the id doesn't match `exclude`, and the word count falls within
`[minWords, maxWords]`. Picking uniformly at random is fine at the corpus
sizes this project will realistically reach (tens of thousands of rows) — if
the corpus ever grows past roughly a million rows, switch to a
random-offset-plus-retry strategy instead of a naive random ordering, but
that's a non-issue until Phase 3's sources are all live.

**Frontend behavior on 404:** fall back to the existing local
`SENTENCE_POOL` in `sentences.ts` rather than showing an error — this is
exactly the "solo play must never depend on the network" pillar from
[§1](#1-what-vroomy-actually-is). The static pool becomes the offline
fallback, not dead code to delete.

### 6.3 Auth endpoints

Minimal — email+password only, no OAuth in scope for the phases planned
here (see [§19](#19-open-questions--risks) for why OAuth is deliberately
deferred).

```
POST /auth/guest
  -- creates a `users` row with is_guest=true, display_name auto-generated
  -- (e.g. "Racer4821"), returns tokens immediately. No email/password.
201 Created
{ "accessToken": "...", "refreshToken": "...", "user": { "id": "...", "displayName": "Racer4821", "isGuest": true } }

POST /auth/register
Body: { "email": "...", "password": "...", "displayName": "..." }
  -- upgrades a guest OR creates fresh; password hashed with argon2id (§12.3)
201 Created / 409 Conflict (email taken)

POST /auth/login
Body: { "email": "...", "password": "..." }
200 OK { "accessToken": "...", "refreshToken": "...", "user": {...} }
401 Unauthorized

POST /auth/refresh
Body: { "refreshToken": "..." }
  -- rotates: old token revoked, new pair issued (§12.3 explains rotation)
200 OK { "accessToken": "...", "refreshToken": "..." }
401 Unauthorized (revoked/expired/reused-after-rotation)

POST /auth/logout
Body: { "refreshToken": "..." }
  -- revokes that refresh token only (other devices stay logged in)
204 No Content
```

### 6.4 Races & leaderboard

```
POST /races
Auth: optional (guest token acceptable)
Body:
{
  "quoteId": 913,
  "mode": "solo",
  "startedAt": "2026-08-25T10:00:00.000Z",
  "endedAt":   "2026-08-25T10:00:42.300Z",
  "participants": [
    { "userId": "...", "isBot": false, "displayName": "Racer4821", "wpm": 71, "accuracy": 96.4, "placement": 2, "finished": true },
    { "userId": null,  "isBot": true,  "displayName": "Nova",      "wpm": 78, "accuracy": 100.0, "placement": 1, "finished": true }
  ]
}
201 Created { "raceId": "..." }
```

For `mode: "multiplayer"`, this same endpoint is called _by `ws`_ (as a
trusted internal caller, see [§7.6](#76-persisting-results-ws--api)) once a
room finishes, not by the frontend directly — the frontend never gets to
assert its own placement for a race that involved other real players.

```
GET /leaderboard?window=all-time|weekly&limit=50
200 OK
{ "entries": [ { "userId": "...", "displayName": "...", "racesPlayed": 12, "avgWpm": 68, "bestWpm": 91, "avgAccuracy": 97.1, "wins": 4 }, ... ] }
```

`window=weekly` needs `races.created_at` filtering in the query behind the
view from [§5.2](#52-api-owned-tables-new-this-is-the-actual-planning-work)
— the view itself stays all-time; weekly is a parameterized query on top of
`race_participants JOIN races`, not a second view, so there's one definition
of "how a leaderboard row is computed."

### 6.5 Error envelope (applies to every endpoint above)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "displayName must be 3-32 characters",
    "field": "displayName"
  }
}
```

Codes used across the API: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401),
`FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429),
`INTERNAL_ERROR` (500). The frontend's Query error handling (currently
nonexistent, see [§11](#11-frontend-integration-plan)) should key off `code`,
not `message` (message is for humans/logs, not `switch` statements).

### 6.6 Rate limiting

Token-bucket per IP (unauthenticated) or per user id (authenticated),
enforced in `middleware/rateLimit.ts` against a Redis counter (same Redis
instance as `ws`'s presence state, different key prefix — `ratelimit:*`).
`/quotes/random` gets a generous limit (it's polled once per race, cheap to
serve); `/auth/*` gets a strict one (5/min/IP) since it's the obvious brute
-force target.

---

## 7. `ws` — real-time protocol

### 7.1 Transport choice

**Recommendation: raw `ws` (the Node/Bun library), not socket.io**, despite
the existing `backend/ws/README.md` TODO suggesting socket.io. Reasoning:
socket.io's main value-adds (auto-reconnect, room abstraction, fallback
transports) are either things this project needs to implement carefully by
hand anyway for correctness (reconnect needs a _grace-period + resume_
semantic specific to mid-race state, not generic reconnect — see
[§7.5](#75-disconnect--reconnect-handling)), or unnecessary (no fallback
transport needed, WebSocket-only browsers are the target). Raw `ws` + a
small typed message envelope keeps the wire protocol inspectable and avoids
a second bespoke event system layered over an already-custom room state
machine. If team velocity matters more than this than the correctness
argument, socket.io remains a reasonable fallback choice — call it out
explicitly if overridden.

### 7.2 Connection & auth

```
wss://ws.vroomy.app/?token=<accessToken>
```

Same JWT `accessToken` issued by `api` (§6.3), verified on the WS upgrade
request before the connection is accepted. Guest tokens work here too —
multiplayer doesn't require a non-guest account (per the auth deferral in
[§5.4 of the original plan / §1 pillars](#1-what-vroomy-actually-is)).
Connections without a valid token are rejected with HTTP 401 at the upgrade
handshake, before a socket is ever established.

### 7.3 Message envelope

Every message, both directions, is JSON with a `type` discriminator —
validated with the same `zod` schemas `api` uses, shared via a small
internal package (see [§17.2](#172-shared-types-package)):

```ts
type ClientMessage =
  | { type: 'join_room'; roomCode: string | null } // null = quick-match into any open room
  | { type: 'create_room' }
  | { type: 'leave_room' }
  | { type: 'ready' } // explicit ready-up before countdown can start
  | { type: 'progress'; charsCorrect: number; clientTimestamp: number }
  | { type: 'ping'; clientTimestamp: number }

type ServerMessage =
  | { type: 'room_joined'; roomCode: string; players: PlayerSummary[]; phase: RoomPhase }
  | { type: 'room_state'; players: PlayerSummary[]; phase: RoomPhase }
  | {
      type: 'race_starting'
      quoteId: number
      text: string
      author: string
      countdownFrom: number
      serverStartAt: number
    }
  | { type: 'race_go' }
  | { type: 'opponent_progress'; playerId: string; progress: number; wpm: number }
  | { type: 'player_finished'; playerId: string; placement: number; wpm: number; accuracy: number }
  | { type: 'race_result'; placements: RaceResultRow[] }
  | { type: 'player_left'; playerId: string }
  | { type: 'pong'; clientTimestamp: number; serverTimestamp: number }
  | { type: 'error'; code: string; message: string }
```

### 7.4 Room lifecycle state machine

This maps directly onto the `phase: 'waiting' | 'counting' | 'ready'` state
already modeled in `TypingRace.tsx` — the plan is to drive that existing
state machine off these server events instead of local `setTimeout`s, not
to redesign it.

```
        join_room / create_room
                 │
                 ▼
        ┌─────────────────┐
        │     lobby         │  room_state broadcast on every join/leave/ready
        │ (2..N players,    │
        │  waiting for all   │
        │  ready or a timeout)│
        └────────┬──────────┘
                 │ all players 'ready' OR lobby_min_players reached + lobby_timeout elapsed
                 ▼
        ┌─────────────────┐
        │   countdown       │  race_starting sent once; countdownFrom ticks
        │  (server-timed,    │  client-side purely for display — server is the clock
        │   ~5s)              │
        └────────┬──────────┘
                 │ countdown hits 0
                 ▼
        ┌─────────────────┐
        │      racing        │  race_go sent; clients start local useTypingRace timer;
        │                     │  progress messages relayed as opponent_progress
        └────────┬──────────┘
                 │ all finished OR race_timeout (e.g. 3× the fastest finisher's time, floor 60s)
                 ▼
        ┌─────────────────┐
        │    finished        │  race_result broadcast, POST /races fired to api (§7.6),
        │                     │  room enters a 10s "results" grace period, then closes
        └─────────────────┘
```

**Room capacity & minimum players:** 2–6 players per room. A room with only
1 player after the lobby timeout (nobody else joined) auto-cancels back to
matchmaking rather than starting a "multiplayer" race with one human — the
frontend should fall back to offering solo-vs-AI in that case, not stall the
UI waiting forever.

**Quick-match vs private rooms:** `create_room` generates an 6-character
room code (unambiguous alphabet, no `0/O/1/I`) shareable out-of-band;
`join_room` with `roomCode: null` places the player into the oldest open
room under capacity, or creates one if none exist (classic matchmaking
queue behavior, implementable as a Redis list of open room codes — no
separate matchmaking service needed at this scale).

### 7.5 Disconnect / reconnect handling

This is the detail generic socket.io reconnect doesn't solve for free — a
typing race has a _hard notion of elapsed time_ that a resume must respect.

- **Disconnect during lobby:** immediate removal from the room, `room_state`
  rebroadcast to remaining players.
- **Disconnect during countdown or racing:** player is marked `disconnected`
  but **kept in the room's player list** for a grace period (30s). Their car
  freezes at last-known progress (not removed from the track — abrupt
  disappearance mid-race is a worse UX than a frozen car). If they
  reconnect within the grace period (same `roomCode` + same user id token),
  they rejoin mid-race: server replies with a `room_state` carrying the
  _current_ `serverStartAt` and current progress of every player, so the
  client can reconstruct `elapsedMs` correctly (`Date.now() - serverStartAt`,
  same formula `useTypingRace.ts` already uses locally with `startedAt`) —
  no separate "resume" message type needed, `race_starting`'s payload is
  replayed with the original timestamps.
- **Disconnect exceeds grace period:** player is marked `finished: false`
  (DNF) with their last-known progress recorded, removed from further
  broadcasts, `player_left` sent to the room. A DNF still gets a
  `race_participants` row (per the schema's `finished` column) so it's
  visible in history, just not eligible for `placement`.
- **All players disconnect:** room is torn down immediately, no result
  persisted (nothing to persist — no `finished` participants).

### 7.6 Persisting results (`ws` → `api`)

When a room reaches `finished`, `ws` calls `api`'s `POST /races`
server-to-server, authenticated with a **service token** (a long-lived,
separately-issued JWT with a `service: ws` claim, not tied to any user —
distinct from player access tokens so a compromised player token can never
forge race results for other players). This is the one deliberate exception
to "the frontend never gets to assert its own placement" in
[§6.4](#64-races--leaderboard) — it's `ws`, not any client, asserting it,
and `ws` computed those placements itself from server-validated progress
(§9), not from client self-report.

### 7.7 Clock sync & latency compensation

`race_starting.serverStartAt` is an absolute server timestamp (ms since
epoch), not a relative "starts in 5000ms" — relative timers drift under
network jitter (a message delayed 300ms in transit means every client's
"5000ms from receipt" is now 300ms apart from each other, defeating the
entire point of a synchronized start). Clients compute
`msUntilStart = serverStartAt - (Date.now() - clockOffset)`, where
`clockOffset` is measured via the `ping`/`pong` round trip on connect
(`clockOffset = ((pongReceived - clientTimestamp) - (serverTimestamp - clientTimestamp)) / 2`,
the standard NTP-style estimate) — cheap, doesn't need to be perfect, just
needs to keep every client's _displayed_ countdown within a human-imperceptible
window of each other. The actual WPM-fairness guarantee doesn't even depend
on this — it depends on the server independently timestamping each
player's own `progress` messages against its own `serverStartAt` (§9), so
clock-sync error only affects how synchronized the _visual_ countdown feels,
never the fairness of the result.

---

## 8. Matchmaking & room lifecycle

(Room state machine itself is specified in [§7.4](#74-room-lifecycle-state-machine);
this section covers the two supporting pieces referenced from there.)

### 8.1 Redis key design for room state

Redis DB1 (kept separate from the scraper's DB0 dedup/frontier keys — see
the architecture diagram in [§3](#3-target-architecture)):

```
room:{code}:state       HASH   phase, quoteId, serverStartAt, ...
room:{code}:players      HASH   playerId -> { displayName, progress, wpm, connected, joinedAt }
matchmaking:open_rooms    LIST   room codes currently accepting quick-match joins
```

A room's full state living in Redis (not just in one `ws` process's memory)
is what makes horizontal scaling of `ws` possible at all — see
[§8.4](#84-horizontal-scaling--multi-instance-ws).

### 8.2 Passage selection

`ws` requests a passage from `api` via an internal HTTP call to
`GET /quotes/random` (§6.2) — reusing the exact same endpoint the frontend
uses for solo mode, rather than a separate internal-only route, keeps "how a
race-ready quote is chosen" defined in exactly one place. This call happens
once, when a room transitions `lobby → countdown`, and the chosen quote is
embedded directly in the `race_starting` broadcast so every client gets it
in one round trip (no separate per-client fetch needed, which also means no
risk of two players in the same room somehow getting different passages
from a race condition between their individual fetches).

### 8.3 Countdown timing

5 seconds from `race_starting` broadcast to `race_go`, fixed
server-side constant (not configurable per room in v1 — configurability is
a nice-to-have, not a correctness requirement, and every knob added here is
another thing that can desync across clients if handled wrong).

### 8.4 Horizontal scaling / multi-instance `ws`

Out of scope for the phases in [§18](#18-phased-roadmap) (a single `ws`
instance easily handles the traffic this project will see well past launch),
but worth designing for now rather than retrofitting: because room state
lives in Redis (§8.1) rather than in-process, a second `ws` instance only
needs Redis pub/sub (`room:{code}:events` channel) to relay messages between
players connected to _different_ instances of the same room. This is a
one-line addition later (subscribe + republish) specifically because §8.1
already externalizes state instead of keeping it in a JS `Map` — call this
out explicitly so nobody "optimizes" early state management into in-memory
-only and quietly closes off this path.

---

## 9. Anti-cheat & server authority

**The core problem:** today, WPM/accuracy/progress are entirely
client-computed and self-reported (`useTypingRace.ts` runs 100% locally,
solo-vs-AI has no other option since there's no server involved). For real
multiplayer this is a cheating vector — a modified client can claim any WPM
or instantly report `progress: 1`.

**The fix, precisely:** the client keeps running `useTypingRace.ts`
unmodified for local responsiveness (instant visual feedback has to stay
client-side — round-tripping every keystroke to the server would make
typing feel laggy), but for multiplayer races specifically, it also streams
its `progress` fraction to `ws` (throttled to every 250ms, not every
keystroke), and **`ws`, not the client, is the source of truth for anything
that affects another player's outcome** (placement, opponent progress
shown to others, final WPM recorded to `race_participants`).

Server-side validation on each `progress` message:

1. **Monotonicity:** a player's reported `progress` can never decrease
   (reject/clamp any message where `progress < lastKnownProgress`) and can
   never exceed `1.0`.
2. **Rate-of-change bound:** the implied WPM between two consecutive
   `progress` messages (`(charsCorrect_new - charsCorrect_old) / 5 / minutesElapsed`)
   is clamped against a hard ceiling (e.g. 400 WPM — no verified human
   typist has ever exceeded roughly 216 WPM sustained; 400 is a generous
   ceiling that only catches obviously-spoofed jumps, not fast typists).
   Messages implying an impossible jump are dropped, not just clamped —
   dropping (rather than clamping to the ceiling) means a bot can't
   "ride the ceiling" for free speed.
3. **Time-since-start bound:** `charsCorrect` can't exceed what's
   physically typeable given `now - serverStartAt` even at the rate-of-change
   ceiling from rule 2 — catches a client that sends one big early jump
   instead of many small suspicious ones.
4. **Placement and `wpm` recorded to `race_participants`** are computed by
   `ws` from its own received-and-validated `progress` timeline for that
   player, using the exact same word-correctness math `useTypingRace.ts`
   already implements client-side (ported to the `ws` service, not
   reinvented) — so a legitimate client and the server should always agree,
   and only a client that's lying can ever produce a divergence, which is
   exactly the case this needs to catch.

This is deliberately **not** full server-side keystroke replay (server
doesn't re-derive `progress` from raw keystrokes, just validates the
client's _rate_ of reported progress against physical limits) — full replay
would be stronger but requires sending every keystroke over the wire, which
reintroduces the input-latency problem this design avoids. The bound-checking
approach here is the standard "trust but verify with sanity limits" pattern
used by most casual competitive-typing products, and is proportionate to
this project's actual threat model (leaderboard bragging rights, not money).

---

## 10. Scraper deep plan

### 10.1 Immediate correctness fixes (blocking everything else in this section)

Per `backend/scraper/handoff.md`, in order, unchanged from the prior plan
but worth restating as the literal first thing that must happen before any
new source is added:

1. Fix `crawler.Run()` to dispatch on `URLFrontier.Source` instead of
   hardcoding `ToscrapeParser`. Needs a DB lookup after `PopURL` (Redis only
   stores URL + priority; source lives in Postgres) — add
   `GetURLByURL(ctx, url) (models.URLFrontier, error)` to `store.go`.
2. Wire `result.Quotes` into `store.SaveQuote` and `result.NextURLs` back
   into the frontier (`SaveURL` + `PushURL` per discovered URL, priority via
   `scoring.CalculatePriority(source, depth+1, 0)`) — currently the parse
   result is discarded entirely even where parsing succeeds.

### 10.2 Politeness / rate limiting (highest-priority gap)

`internal/fetcher/fetcher.go` today is a bare, unthrottled `http.Client.Do`
with no timeout set on the client (a hung remote server would hang the
entire crawl loop indefinitely) and no per-domain delay — despite the
scraper's own README marking rate limiting `✅ Done`. This must be resolved
_before_ Phase 1's BrainyQuote crawl runs against the real site, or the
crawler will get IP-banned on the first run against a source the scraper's
own README already flags as having "aggressive bot detection" (that note is
about Goodreads specifically, but the underlying gap is fetcher-wide).

Concrete plan:

- **`http.Client` timeout:** set explicitly (e.g. 15s) — a client with no
  timeout is a hang waiting to happen the first time a target server stalls.
- **`robots.txt` compliance:** fetch and cache each domain's `robots.txt` on
  first request to that domain (in-memory cache, TTL 24h), respect
  `Disallow` rules and any `Crawl-delay` directive as a floor on the
  per-domain delay below.
- **Per-domain token bucket:** one bucket per hostname (map keyed by
  `url.Host`, guarded by a mutex — the fetcher will eventually run
  concurrently, see §10.5), refilling at a conservative default (e.g. 1
  request per 2s per domain, tunable per source since BrainyQuote/Goodreads
  likely need different ceilings — reuse the existing `scoring` package's
  per-source config pattern rather than inventing a second one).
- **Exponential backoff on non-2xx/network errors:** on a failed fetch,
  don't just `MarkURLFailed` and move on immediately (today's behavior) —
  the _next_ attempt at that URL should back off (`error_count` already
  exists on `url_frontier` and already feeds `scoring.CalculatePriority`'s
  `ErrorPenalty`, so the frontier naturally deprioritizes a flaky URL; what's
  missing is an actual minimum wall-clock delay before retry, not just a
  lower queue priority — add a `next_attempt_after` column or reuse
  `last_crawled_at` as the gate).
- **Circuit breaker per domain:** if a domain returns N consecutive
  failures (e.g. 5) across any URLs, stop attempting that domain entirely
  for a cool-down window (e.g. 1 hour) rather than burning through the rest
  of that domain's frontier entries one by one into `failed`.

### 10.3 BrainyQuote parser (`internal/parser/brainyquote.go`)

Implements the `Parser` interface — returns both quotes and next-page URLs
in one `Result`, per the pattern `parser.go` already establishes. Before
writing selectors: open the target page, inspect the DOM for the quote
container, quote text, author name, and pagination link elements (topic
pages and individual author pages are structurally different on
BrainyQuote — handle both shapes inside this one parser via a type-sniff on
the HTML, rather than a second parser type, since they're still one
logical source). Use `goquery` (already a scraper dependency) for
extraction, same as `ToscrapeParser`.

### 10.4 Wikiquote via MediaWiki API (`internal/parser/wikiquotes.go`)

Currently an empty stub. Wikiquote is the one source in the table where
**"Crawler" isn't actually the right method** — it exposes a real MediaWiki
API (`action=parse` / `action=query`) that returns wikitext, not HTML to
scrape. This parser is architecturally different from the other two: it
should hit the API endpoint directly (no `goquery` HTML parsing at all) and
parse MediaWiki's `{{quote|...}}`-style templates and bullet-list quote
formatting out of wikitext. Because this doesn't fit the "fetch HTML, run a
CSS-selector parser" shape the `Parser` interface otherwise assumes, decide
at implementation time whether it's a variant `Parse` call fed API JSON
instead of HTML, or a small adapter that fetches+converts before handing
off to the same interface — either way, note it up front so it isn't
implemented by accident as an HTML scraper against Wikiquote's rendered
pages (which would be far more fragile and exactly the kind of
over-engineering the "trust framework guarantees" principle warns against
when a real API already exists).

### 10.5 Worker concurrency

Today's crawl loop is strictly single-threaded (one `PopURL` → fetch →
parse → save cycle at a time). Once Phase 3 adds multiple real sources, a
single-threaded loop means a slow/rate-limited domain (Goodreads,
deliberately throttled per §10.2) blocks progress on every _other_ domain's
otherwise-available frontier entries. Plan: a small worker-pool (N
goroutines, N tunable, small default like 4) each running the same
pop→fetch→parse→save cycle independently — the per-domain token bucket from
§10.2 already makes this safe (a worker that pops a rate-limited domain's
URL just waits on that domain's bucket, it doesn't block other workers
pulling different domains). This is explicitly **not** the previously-noted
"Asynq weighted queues" idea from the scraper's own README TODO — a plain
goroutine pool against the existing Redis frontier is simpler and
sufficient at this project's scale; only revisit Asynq if queue
observability/retry tooling actually becomes a pain point in practice.

### 10.6 Content licensing note

Worth recording explicitly since it's easy to overlook while heads-down on
scraping mechanics: BrainyQuote, Goodreads, and Wikiquote each have their
own terms of use around scraping/reuse, and quotes themselves may carry
attribution expectations independent of copyright status on the quote text.
Before Phase 3 sources go live in anything user-facing beyond local dev,
confirm each source's terms permit this use, and keep `quotes.source`
populated (it already is) so attribution/removal-on-request is always
possible per-source.

### 10.7 Scheduling

The crawler is a long-running loop today (`Run()` never returns), which is
fine for continuous operation but means "run the crawler" and "keep the
crawler running forever" are the same deploy decision. Plan: keep it as a
long-running process (not a cron-triggered one-shot) since the frontier
model already assumes a persistent loop (`WarmFrontierCache` /
`WarmSimhashCache` on startup would otherwise re-run needlessly on every
cron tick) — deploy it as a single long-lived container/systemd service,
restart-on-crash, not as a scheduled job.

---

## 11. Frontend integration plan

### 11.1 New routes

TanStack Router file-based routes to add under `src/routes/`:

| Route                 | Purpose                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| `/race/$roomCode`     | Multiplayer room — lobby, countdown, race, results, driven by the `ws` connection |
| `/leaderboard`        | Reads `GET /leaderboard` via TanStack Query                                       |
| `/login`, `/register` | Only needed once Phase 5 auth ships — thin forms against §6.3                     |

`/` stays solo-vs-AI exactly as it works today; `RaceSetup.tsx`'s
`MultiplayerStep` "coming soon" placeholder becomes a room create/join form
that navigates to `/race/$roomCode` on success.

### 11.2 State management for multiplayer

Not a new global state library — a single `WsClient` context (a thin class
wrapping the `WebSocket`, exposing a typed `send`/`on` API matching the
message envelope in [§7.3](#73-message-envelope)) plus a `useReducer` local
to the `/race/$roomCode` route driving the same `'waiting' | 'counting' |
'ready'`-shaped phase state `TypingRace.tsx` already has, just fed by
`room_state`/`race_starting`/`race_go` events instead of local timers. The
existing `useTypingRace` hook needs exactly one new capability: an optional
`onProgress` callback fired on its existing progress calculation, wired to
throttle-send `progress` messages over the `WsClient` when in multiplayer
mode — everything else in that hook (word-lock logic, WPM math) is reused
unmodified. `useBotRacers`'s output shape (`BotRacer`) and the `ws`-fed
remote-player shape should converge on the same fields so `RaceTrack.tsx`'s
`Racer` mapping in `TypingRace.tsx` needs only a different data source, not
a different mapping function.

### 11.3 TanStack Query usage patterns

First real use of the already-wired `QueryClient`:

- `useQuery(['quote', 'random', excludeId], ...)` for `/quotes/random`,
  `staleTime: 0` (a "fresh sentence" is the whole point, caching defeats
  it) but keep `retry` conservative (1 retry) before falling back to the
  local `SENTENCE_POOL` per §6.2.
- `useMutation` for `POST /races` (Phase 5) and `/auth/*` calls.
- `useQuery(['leaderboard', window], ...)` with a sane `staleTime` (e.g.
  60s) since leaderboard freshness isn't second-sensitive.

### 11.4 Environment configuration

Needs introducing from scratch (none exists today): `VITE_API_URL` and
`VITE_WS_URL`, read via `import.meta.env`, with local-dev defaults pointing
at `localhost` ports matching whatever `docker-compose.yml` exposes
(§13.1). No secrets belong in frontend env vars (everything here is a
public base URL) — this is a build-time-embedded config concern, not a
security boundary.

### 11.5 Error / loading UX

Today's `TypingRace.tsx` has no async states at all (sentence selection is
synchronous). Once `/quotes/random` is wired in (Phase 2), the pre-race
screen needs a loading state while the first fetch resolves, and — per
§6.2's fallback behavior — should never show a hard error for a failed
fetch, only silently fall back to the local pool. Multiplayer (Phase 4)
does need real error UX: room-not-found on `/race/$roomCode` (invalid/expired
code), and a disconnected-from-server banner during the grace period from
§7.5 so a reconnecting player understands what's happening rather than
seeing a frozen screen.

---

## 12. Security

### 12.1 Input sanitization

Quote `text`/`author` fields are scraped, untrusted, third-party content
rendered directly into the DOM (`Word` component in `TypingRace.tsx` renders
`span.word` as text content, not `dangerouslySetInnerHTML` — already safe by
construction, since React text children are auto-escaped). This must stay
true when the text is API-fetched instead of hardcoded: never introduce
`dangerouslySetInnerHTML` for quote rendering, and the same applies to any
future rendering of `displayName` (user-supplied) anywhere in room/leaderboard
UI.

### 12.2 SQL injection

Already a non-issue in the scraper (`pgx` parameterized queries throughout
`store.go`) — carry the same discipline into `api` regardless of ORM/query
builder choice (Drizzle parameterizes by default; if raw SQL is ever used
for the leaderboard view's parameterized weekly-window query, use bound
parameters, never string-interpolated SQL).

### 12.3 Auth: password hashing & token strategy

- **Password hashing:** argon2id (not bcrypt — argon2id is the current
  OWASP recommendation and better resists GPU-based cracking), tuned to
  ~250ms per hash on the target deploy hardware.
- **Access tokens:** short-lived JWT (15 min), signed with a server-side
  secret (HS256 is fine at this scale — no need for asymmetric keys with a
  single `api` issuer and `api`+`ws` as the only verifiers), carrying
  `userId`, `isGuest`, `exp`.
- **Refresh tokens:** opaque random tokens (not JWTs — no benefit to
  self-describing refresh tokens since they're always looked up against
  `refresh_tokens` anyway), stored **hashed** (SHA-256) per §5.2's schema,
  long-lived (30 days), **rotated on every use** (old token revoked,
  new one issued) — rotation means a leaked-and-reused refresh token is
  immediately detectable (the legitimate client's next refresh attempt with
  the now-revoked token signals theft) and is standard practice for exactly
  this reason.
- **Guest accounts:** `POST /auth/guest` issues real tokens for a real
  `users` row with `is_guest=true` — this is what lets multiplayer (§7.2)
  work without forcing registration, while still giving `ws` a stable
  `userId` to attach progress/results to.

### 12.4 CORS

`api` and `ws` both restrict `Access-Control-Allow-Origin` (and, for `ws`,
validate the `Origin` header on the upgrade request) to the known frontend
origin(s) from an env-configured allowlist — never a wildcard, since
authenticated endpoints are in play.

### 12.5 WS message validation

Every inbound client message is validated against its `zod` schema
(§7.3) before any handler logic runs — reject with a `type: 'error'` message
and, on repeated malformed messages from one connection, drop the
connection. This is the same discipline as `api`'s Zod-validated REST
bodies, just applied to the WS envelope so a malformed/malicious message
can't reach the anti-cheat logic in §9 with unexpected shapes.

### 12.6 Secrets management

`JWT_SECRET`, `WS_SERVICE_TOKEN_SECRET` (§7.6), `DATABASE_URL`,
`REDIS_URL` — all via env vars, never committed (the existing `.env` files
under `backend/api/` and `backend/scraper/` are already gitignored per the
root `.gitignore` — confirm this stays true for any new service's `.env`
too). Root-level `docker-compose.yml` (§13.1) should read these from a
single `.env` at the repo root rather than duplicating credentials across
per-service `.env` files as happens today.

---

## 13. Deployment & infrastructure

### 13.1 Unifying the two docker-composes

`backend/api/docker-compose.yml` and `backend/scraper/docker-compose.yml`
each spin up **their own independent Postgres container** on the same
default port (5432), with different env var names (`POSTGRES_USERNAME` vs
`POSTGRES_USER`) and no shared network — running both simultaneously as-is
port-collides. Replace both with a single root-level compose file defining
one Postgres and one Redis, plus the three backend services, each depending
on the datastores it needs and reading shared config from one root `.env`:

| Service    | Depends on      | Notes                                                                                        |
| ---------- | --------------- | -------------------------------------------------------------------------------------------- |
| `postgres` | —               | one instance, one set of credentials, shared by `scraper` and `api`                          |
| `redis`    | —               | password-protected; DB0 for the scraper's dedup/frontier state, DB1 for `ws` room state (§3) |
| `scraper`  | postgres, redis | no exposed port — background worker only                                                     |
| `api`      | postgres        | exposed on its own port for the frontend/reverse proxy to reach                              |
| `ws`       | redis, api      | exposed on its own port; depends on `api` being up since it calls it internally (§8.2)       |

Health checks gate startup ordering (e.g. `api` and `scraper` wait for
Postgres to report ready, not just for the container to start) so a cold
`docker compose up` doesn't race a service against a database that isn't
accepting connections yet.

`frontend` is intentionally **not** in this compose file — it's run via
Nitro/`bun run dev` directly on the host during development (per its
existing README), and deployed separately (§13.3). Bundling it into the
same compose would slow the frontend dev loop for no benefit, since it has
no shared-network dependency on the other services beyond the HTTP/WS URLs
already handled by env vars (§11.4).

### 13.2 Backend hosting

Any small VPS (Hetzner/DigitalOcean/Fly.io-class) running the compose file
above is sufficient at this project's scale — no need for
Kubernetes/managed-service complexity here. Put a reverse proxy (Caddy is
the pragmatic choice — automatic TLS via Let's Encrypt with near-zero
config) in front of `api` and `ws`, terminating TLS and routing
`api.vroomy.app` → `api:4000`, `ws.vroomy.app` → `ws:4001`.

### 13.3 Frontend hosting

Nitro's Node-server build output (already documented in
`frontend/README.md`) deploys to any Node-compatible host. Given the rest of
the stack is self-hosted on a VPS already, the pragmatic default is
deploying the frontend's Nitro output alongside the backend services under
the same Caddy reverse proxy (`vroomy.app` → the Nitro Node process) rather
than introducing a third hosting provider — but this is genuinely
interchangeable (Vercel/Netlify/Cloudflare presets all exist per Nitro's own
docs) and is one of the lower-stakes decisions in this plan; revisit if
there's a reason to split it out (e.g. wanting edge caching for static
assets).

### 13.4 Environment variable catalog

| Var                           | Used by                 | Notes                                                                                                                                                |
| ----------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER/PASSWORD/DB`   | postgres, scraper, api  |                                                                                                                                                      |
| `REDIS_PASSWORD`              | redis, scraper, ws      |                                                                                                                                                      |
| `DATABASE_URL`                | api, scraper            | derived from the above or set directly                                                                                                               |
| `REDIS_URL`                   | scraper (DB0), ws (DB1) | same host, different logical DB index                                                                                                                |
| `JWT_SECRET`                  | api, ws                 | ws only needs it to _verify_, never to sign player tokens                                                                                            |
| `WS_SERVICE_TOKEN_SECRET`     | api, ws                 | §7.6/§12.3 — separate from `JWT_SECRET` so a `ws`-issued service token and a player access token are never interchangeable even if one secret leaked |
| `CORS_ALLOWED_ORIGINS`        | api, ws                 |                                                                                                                                                      |
| `VITE_API_URL`, `VITE_WS_URL` | frontend (build-time)   | public, non-secret                                                                                                                                   |

---

## 14. Observability

- **Structured logging:** the scraper today uses plain `log.Printf` with ad
  hoc strings (including a stray `log.Printf("Test")` left in `crawler.go`'s
  loop — a good example of exactly the kind of debug-leftover to clean up
  alongside the Phase 1 fixes). Move to structured logging (Go's `slog`,
  already suggested in the scraper's own README TODO) across all three
  backend services once `api`/`ws` exist, with consistent fields
  (`service`, `event`, and request/room/user ids where relevant) so logs
  from all three services can be correlated in one place.
- **Health checks:** `GET /health` on both `api` and `ws` (simple DB/Redis
  ping), used by the reverse proxy and by `docker-compose`'s own
  `depends_on: condition: service_healthy` where applicable.
- **Metrics worth tracking from day one** (doesn't need a full
  Prometheus/Grafana stack immediately, but the _events_ worth counting are
  worth deciding now so logging captures them): scraper crawl rate / save
  rate / error rate per source (the scraper README's own Phase 4 TODO
  already calls this out), `api` request latency/error rate per route,
  `ws` concurrent connections / active rooms / average room size / anti-cheat
  rejection rate (§9) — a spike in rejected `progress` messages is a
  meaningful signal worth being able to see.
- **Error tracking:** a hosted error tracker (Sentry or similar) for `api`
  and the frontend is a reasonable low-effort addition once either has real
  traffic — not a blocker for any phase in §18, just worth having the hook
  point in mind (Hono and React both have lightweight Sentry SDKs) rather
  than bolting it on ad hoc later.

---

## 15. CI/CD

GitHub Actions, one workflow per concern rather than one monolithic
pipeline, since the three backend services and the frontend have
independent toolchains and shouldn't block each other on unrelated
failures:

```
.github/workflows/
├── frontend.yml     bun install → lint → typecheck → build (on frontend/** changes)
├── scraper.yml       go test ./... (already has testcontainers coverage — run in CI as-is)
├── api.yml            bun install → lint → typecheck → test (once api exists)
└── ws.yml              same shape as api.yml
```

Path-filtered (`paths: ['frontend/**']` etc.) so a scraper-only change
doesn't trigger a frontend build. `husky`'s existing pre-commit
lint-staged setup stays as the fast local gate; CI is the authoritative gate
before merge. Deployment (building/pushing the Docker images from §13.1 and
restarting the VPS's compose stack) is a separate `deploy.yml` triggered on
merge to `main`, out of scope to fully specify here since it depends on
which VPS/registry gets picked in §13.2 — but the shape is: build → push
image → SSH `docker compose pull && docker compose up -d` (or a lighter
webhook-based redeploy if the chosen host supports it).

---

## 16. Testing strategy

- **Scraper (Go):** already has real coverage — `dedup` 96.6%, `parser`
  91.7%, `db` 64.2% using `testcontainers-go` for isolated Postgres/Redis.
  This is the bar the rest of the backend should match: don't mock the
  database, spin up real containers. New parsers (§10.3/§10.4) should ship
  with fixture-HTML tests the same way `toscrape_test.go` already does
  (`internal/parser/testdata/`).
- **`api`:** integration tests against a real (testcontainer or local
  docker-compose) Postgres, covering the contract in §6 directly — for each
  endpoint, at least the success path and its documented error codes
  (§6.5). Auth flows (§12.3) specifically need a test for refresh-token
  rotation-detects-reuse, since that's the one piece of the auth design
  that's silently wrong if untested.
- **`ws`:** the anti-cheat bounds in §9 are pure functions
  (`progress → accept/reject/clamp`) and should be unit-tested directly
  with adversarial inputs (impossible jumps, negative deltas, timestamps
  before `serverStartAt`) independent of any actual socket — keep that
  validation logic factored out of the connection-handling code specifically
  so it's testable without spinning up a WebSocket server. Room lifecycle
  (§7.4) — lobby→countdown→racing→finished, plus the disconnect/reconnect
  grace-period behavior in §7.5 — needs at least one integration-style test
  driving real WebSocket connections against a running instance, since
  that's exactly the kind of timing-sensitive state machine that's easy to
  get subtly wrong and hard to verify by reading the code alone.
- **Frontend:** no test setup exists at all today (no test runner in
  `package.json`, no `*.test.tsx` files). `useTypingRace.ts`'s word-commit
  logic is exactly the kind of fiddly state machine (backspace boundaries,
  overflow-character capping, WPM gating) that's cheap to regress silently
  and worth unit-testing (Vitest is the natural fit alongside Vite) before
  it gets an `onProgress` hook added for multiplayer (§11.2) — better to
  have a regression net in place before that change than after.

---

## 17. Monorepo tooling

### 17.1 Bun workspaces

Currently `frontend/` and each `backend/*` service have fully independent
lockfiles/`node_modules`, and the root `package.json` has no `workspaces`
field — there is no dependency sharing or single-install convenience today.
Once `api` and `ws` exist as real TypeScript projects (they will be, per
the framework choice in §6.1 and the `ws` recommendation in §7.1), converting
the root `package.json` to a Bun workspace (`"workspaces": ["frontend", "backend/api", "backend/ws"]`)
gets a single `bun install` at the root, and — more importantly — enables
§17.2 below. `backend/scraper` stays outside the workspace (it's Go, has
its own module system already).

### 17.2 Shared types package

The WS message envelope (§7.3) and the REST error envelope (§6.5) are
contracts that `frontend`, `api`, and `ws` all need to agree on. Rather than
hand-copying `zod` schemas/TS types into three places (guaranteed to drift),
add a fourth workspace package, `backend/shared` (or `packages/shared` if
that reads better once the workspace exists), exporting the `zod` schemas
for both the REST error shape and every WS message type — `api` and `ws`
import and validate against it server-side, `frontend` imports the same
schemas for typing its `WsClient` (§11.2) and Query response types. This is
the single highest-leverage piece of monorepo tooling for this project
specifically because the WS protocol in §7 is the part most likely to drift
silently between client and server if hand-duplicated.

---

## 18. Phased roadmap

Each phase is independently shippable/valuable — no phase requires a later
one to already exist for what it delivers to matter.

### Phase 0 — Repo hygiene

- [ ] Replace the two conflicting `docker-compose.yml` files with the
      unified one in §13.1.
- [ ] Consolidate env vars into one root `.env` (gitignored), update both
      services' code to read the unified var names.
- [ ] Resolve the scraper README's rate-limiting claim vs. reality gap —
      either the doc is wrong or §10.2 needs to land first; don't leave the
      README asserting something the code doesn't do.
- [ ] Remove the stray `log.Printf("Test")` in `crawler.go` and other
      debug leftovers found while doing Phase 1 work.

### Phase 1 — Finish the scraper's first real source

- [ ] §10.1: fix `crawler.Run()`'s hardcoded parser dispatch; add
      `GetURLByURL`.
- [ ] §10.1: wire `result.Quotes` into `store.SaveQuote` and
      `result.NextURLs` back into the frontier (currently silently
      discarded even on parser success).
- [ ] §10.2: fetcher timeout, `robots.txt` compliance, per-domain token
      bucket, exponential backoff, circuit breaker.
- [ ] §10.3: implement `internal/parser/brainyquote.go`.
- [ ] §5.1: add `word_count`/`race_ready` columns + population logic in
      `SaveQuote`.
- [ ] Goal: crawler runs unattended, `quotes` table fills with real,
      deduplicated, race-ready BrainyQuote content.

### Phase 2 — Stand up `api`, connect the frontend to real content

- [ ] §6.1: scaffold Hono + Zod service, Drizzle schema for the
      `api`-owned tables (§5.2), migrations against the shared Postgres.
- [ ] §6.2: implement `GET /quotes/random`.
- [ ] §11.3/§11.4/§11.5: replace `sentences.ts`'s `getRandomSentence()`
      with a TanStack Query-backed fetch, env-configured API base URL,
      loading state, silent-fallback-to-local-pool on failure.
- [ ] §16: integration tests for the endpoint against a real Postgres.
- [ ] This is the first phase where solo-vs-AI races use real scraped
      content instead of the static 8-sentence pool — independently
      valuable even before any multiplayer work starts.

### Phase 3 — More scraper sources

- [ ] §10.4: Wikiquote via MediaWiki API.
- [ ] Goodreads parser (deliberately throttled per §10.2's per-domain
      config — this is the source the scraper's own README flags as having
      aggressive bot detection).
- [ ] Kaggle CSV bulk importer (a one-off script/`cmd/` binary, not part of
      the continuous crawl loop — bulk-seeds the corpus fast without
      waiting on live crawling).
- [ ] §10.5: worker-pool concurrency in the crawl loop, now that multiple
      real sources exist and a single slow domain shouldn't block the
      others.
- [ ] §10.6: confirm each source's terms of use before this content is
      exposed beyond local dev.

### Phase 4 — Stand up `ws`, wire real multiplayer

- [ ] §7.1: scaffold `ws` (raw `ws` + Zod, per the recommendation — or
      socket.io if that recommendation is overridden).
- [ ] §17.2: extract the shared message-envelope schemas first, before
      writing handler logic against them, so `frontend` and `ws` build
      against one contract from the start rather than converging later.
- [ ] §7.4/§7.5: room lifecycle state machine, disconnect/reconnect grace
      period.
- [ ] §8: matchmaking (quick-match + private room codes), Redis room-state
      keys.
- [ ] §9: server-side progress validation (monotonicity, rate-of-change
      bound, time-since-start bound) — port the word-correctness math from
      `useTypingRace.ts` server-side.
- [ ] §7.6/§6.4: `ws` → `api` service-token-authenticated `POST /races` on
      room finish.
- [ ] §11.1/§11.2: `/race/$roomCode` route, `WsClient` context, replace
      `RaceSetup.tsx`'s "coming soon" `MultiplayerStep` with real room
      create/join UI, wire the existing `phase` state machine in
      `TypingRace.tsx` off server events for multiplayer races.
- [ ] §16: WS integration tests (real connections, not just unit tests of
      the validation functions).

### Phase 5 — Accounts, persistence, leaderboards

- [ ] §12.3: guest accounts, register/login, argon2id hashing, JWT +
      rotating refresh tokens.
- [ ] §5.2/§6.4: persist solo-race results too (opt-in), once accounts
      exist to attach them to.
- [ ] §6.4: `/leaderboard` endpoint + `leaderboard` view.
- [ ] §11.1: `/leaderboard`, `/login`, `/register` routes.

---

## 19. Open questions & risks

Recorded explicitly rather than silently assumed, since a plan this detailed
is only honest if it also names what it _hasn't_ decided:

- **OAuth (Google/GitHub login) is deliberately out of scope** for the
  phases above — email+password + guest accounts cover the product need
  (frictionless multiplayer entry, optional persistent identity) without
  the added complexity of OAuth provider integration; revisit only if
  registration friction turns out to matter in practice.
- **Splitting `quotes`/`url_frontier` into a physically separate database
  from the `api`-owned tables** is a natural future step if the two
  services' scaling needs diverge (the deliberate lack of a DB-level FK in
  §5.2 is what keeps this option open) — not needed at current scale, but
  worth knowing the schema was designed not to block it.
- **`ws` transport (raw `ws` vs socket.io)** — §7.1 makes a specific
  recommendation with reasoning, but this is the one infrastructure choice
  in this plan most worth re-litigating with whoever implements Phase 4, since
  it's a framework preference as much as a technical one.
- **Anti-cheat (§9) is bound-checking, not full replay** — appropriate for
  this project's actual threat model (bragging-rights leaderboards, not
  money), but explicitly not airtight against a sufficiently motivated
  cheater. Fine as designed; just don't market Vroomy's leaderboard as
  cheat-proof.
- **Corpus size risk:** Phase 2 ships as soon as _any_ race-ready quotes
  exist, but a tiny corpus means players see repeats fast. Phase 3's
  additional sources are what actually fixes this — Phase 2's "independently
  valuable" claim in the roadmap holds even with a small corpus, but is
  much stronger once Phase 3 lands.
- **Room abandonment cleanup:** §7.4/§7.5 cover graceful teardown, but a
  `ws` process crash mid-race leaves Redis room keys with no TTL set as
  specified — add a TTL (e.g. 1h) to every `room:{code}:*` key as a backstop
  so a crashed instance can't leak rooms forever, even though the intended
  path is always explicit teardown.

---

## For Max

- Use [Bun](https://bun.com/) instead of `npm` for the nice TypeScript dev
  experience.
- You also got [WebStorm](https://www.jetbrains.com/de-de/webstorm) for free
  (non-commercial use).
- eslint-staged annoying you on commits? `git commit -m "bla bla" --no-verify`
- Main branch ahead of your branch? `git pull --rebase` (look up what rebase
  does and how to resolve merge conflicts if you're unsure).
