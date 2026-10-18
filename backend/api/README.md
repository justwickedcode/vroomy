# quotes-api

Vroomy's REST API, in Go. It serves typing-race passages from the `quotes` table that the separate `quotes-crawler` project fills, and owns everything player-related: profiles and cosmetics, race history with keystroke replays, daily-challenge results, leaderboards, and friends.

## Why Go, not Elysia/Hono

The original plan (see git history) was a TypeScript API using Elysia or Hono. It became Go once the first real job was clear: read quotes the crawler had already collected, using a schema and word-count rules the crawler's own Go code defines. Rebuilding that in a second runtime would have been duplication for no benefit, and the player features added since fit the same small `net/http` + `pgx` service without needing a framework.

## Identity

This API never sees a browser. It has no public domain (see the root `docker-compose.yml`); only the frontend's own server calls it, after verifying the player's session cookie, and it forwards who the player is as `X-Vroomy-User-Id` / `-Name` / `-Email` / `-Avatar` headers (see `frontend/src/lib/api/server.ts`). Endpoints under `/api/users/me` require `X-Vroomy-User-Id` and return `401` without it. User ids are the identity provider's `sub` claim.

## Relationship to quotes-crawler

The crawler that fills the quotes corpus lives in its own repo (`quotes-crawler`, split out of this monorepo's former `backend/scraper`). The **only** coupling between the two is the shared Postgres database — this API needs nothing from the crawler beyond a `DATABASE_URL` and a couple of read queries. No Redis, no shared code.

- **Database**: points at the _same_ Postgres instance quotes-crawler writes to (see `.env` — `DATABASE_URL`), not a separate one. Run quotes-crawler's own `docker-compose.dev.yml` to get that database running locally.
- **Schema/migrations**: the `quotes` table is owned entirely by quotes-crawler (its `PRODUCTION.md` lists the columns Vroomy depends on). This API never migrates or writes it — run the crawler at least once against a fresh database before starting this API, so the `quotes` table (and its `word_count` column, which this API's filtering depends on) actually exists.
- **`word_count`**: a column quotes-crawler's `db.SaveQuote` computes and stores on every quote at write time (indexed alongside `language`) — this API filters on it directly rather than re-splitting every candidate row's text on every request.

## Running it

```bash
go run .
```

Reads `.env` for `DATABASE_URL`, `API_PORT` (default `8080`), and `CORS_ALLOWED_ORIGIN` (default `http://localhost:3000`, i.e. the frontend's dev server). `.env` is optional — if it's just not present (e.g. running in a container, where config comes from the environment directly), that's not an error; only a genuinely malformed `.env` file that does exist is fatal.

For a production deployment see the "Deployment" section of the root `README.md` and the comments in `../../docker-compose.yml`.

## Rate limiting

The endpoints a logged-out visitor can reach (`/api/quotes/random`, `/api/quotes/daily`, `/api/leaderboards`, `/api/replays/{id}`) are each limited to 30 requests/minute per IP (burst of 10) — see `ratelimit.go`. Asking for race tickets, saving races and importing them is limited to 12/minute per player (burst of 6). This API has no accounts or API keys (it's called directly from any visitor's browser), so per-IP limiting is the only practical abuse control available; it's sized generously for real gameplay (one new sentence per race, roughly every 10-60+ seconds) and exists to stop a script hammering the endpoint, not to throttle real players. `/health` is exempt, since an orchestrator's own healthcheck polling it every few seconds shouldn't be able to trip a limit meant for abuse.

Prefers `X-Forwarded-For`'s first entry when present (set this correctly in your reverse proxy), falling back to the direct connection's address for local dev where there's no proxy in front.

## Endpoints

### `GET /api/quotes/random`

Returns one random quote suitable for a typing race.

Query params (all optional):

| Param      | Default | Notes                                                                                                                     |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `language` | `en`    | Matches `quotes.language` (`en` or `de` currently)                                                                        |
| `minWords` | `25`    | Matches the word-count floor the frontend's placeholder pool was tuned for — short passages make WPM numerically unstable |
| `maxWords` | `60`    | Upper bound, same reasoning                                                                                               |
| `exclude`  | —       | Exact text to exclude, so the next race doesn't repeat the passage just shown                                             |

```json
{
  "text": "Racing against the clock is the only way to know how fast your fingers really are...",
  "author": "Mark Twain",
  "source": "wikiquote-en",
  "language": "en"
}
```

`404` (`{"error": "no quote matches the requested filters"}`) if nothing matches — a real, expected outcome (an unusual word-count range, a language with a small corpus), not a server error. The frontend should fall back to its static placeholder pool in this case rather than treating it as broken.

Text returned here has already been run through `MakeTypingSafe` — em/en dashes, curly quotes, and ellipsis characters are normalized to plain-ASCII equivalents (checked live: roughly a quarter of typing-eligible quotes contain one of these) so the game's exact character-match input handling doesn't punish a player for punctuation they have no reasonable way to type. Accented letters (names, borrowed words) are left as-is — typeable, just with an extra keystroke on some layouts, and not worth stripping legitimate content over.

### `GET /api/quotes/daily`

Returns the daily challenge passage: one quote per calendar day, identical for every player. The first request for a day picks a quote from the corpus (same filters as `/api/quotes/random`) and freezes it in the `daily_quotes` table, so the passage doesn't shift as the crawler adds rows; concurrent first requests resolve to the same row via `ON CONFLICT DO NOTHING`.

| Param  | Default     | Notes                                                                                                                                      |
| ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `date` | today (UTC) | `YYYY-MM-DD`, the player's local date. Must be within one day of today in UTC (i.e. "today" somewhere on Earth); anything else is a `400`. |

```json
{
  "text": "...",
  "author": "Mark Twain",
  "source": "wikiquote-en",
  "language": "en",
  "date": "2026-10-16"
}
```

`404` if the corpus has no eligible quote at all. Shares the same per-IP rate limit settings as `/api/quotes/random` (its own bucket).

### Profile and races

| Endpoint                          | What it does                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/users/me`               | Creates the user row on first call, then returns identity, cosmetics, the 50 most recent races, and lifetime stats (`racesPlayed`, `bestWpm`, `avgWpm`, `avgAccuracy`, `wins`) |
| `PUT /api/users/me/cosmetics`     | Saves car, underglow, trail and power-up                                                                                                                                       |
| `POST /api/users/me/race-tickets` | `{"mode": "solo"\|"daily", "passage", "dailyDate"}` → `{"ticket"}`: asked for before a race starts (see below)                                                                 |
| `POST /api/users/me/races`        | Records one finished race (see below)                                                                                                                                          |
| `POST /api/users/me/races/import` | Bulk-uploads up to 50 races a guest played before logging in                                                                                                                   |
| `POST /api/users/me/purchases`    | `{"itemId": "car:lambo"}`: buys a garage item at its catalog price (`shop_prices.json`). `402` without enough coins, `409` if already owned                                    |
| `GET /api/users/me/daily`         | The player's daily-challenge results for the last 60 days                                                                                                                      |
| `POST /api/users/me/daily/import` | Bulk-uploads a guest's daily results (idempotent: keeps the best per day)                                                                                                      |

A race body:

```json
{
  "wpm": 82,
  "accuracy": 97,
  "placement": 1,
  "racerCount": 5,
  "mode": "solo",
  "passage": "The text that was typed...",
  "replay": [
    [0, 1, 0],
    [140, 1, 1],
    [310, 4, 0],
    [9120, 214, 0]
  ],
  "dailyDate": "2026-10-16",
  "ticket": "4b3562564655e9b79e55a948acaad80c"
}
```

- `mode` is `solo`, `multiplayer` or `daily`.
- `ticket` is required: the race ticket it's saved against, once (`tickets.go`). A solo or daily race asks for one when its passage appears; the race is refused if it's for another passage, mode or day, more than 2 hours old, or if the replay says the race took longer than the time since the ticket was issued (a replay made up after the fact). A multiplayer race's ticket is the `receipt` the ws server sends the finisher; it carries the server's own WPM, placement and racer count, which replace whatever the browser sent.
- `replay` is required (except for a multiplayer race, where the server measured the result). Each event is `[msSinceStart, typedLength, rejected]`. The game only accepts correct characters, so what the player had typed at any moment is `passage[:typedLength]`, which keeps a whole race to a few KB. `rejected` is `1` for a keystroke the game refused (a typo). The server checks that timestamps never go backwards, lengths stay inside the passage, and the timeline ends on the last character (`replays.go`).
- `dailyDate` (with `mode: "daily"`) also records the run as that day's daily-challenge result, in the same transaction, keeping only the player's best run per day.

### Coins and the garage shop

Every recorded race pays coins (`shop.go`'s `coinsForRace`: 10 for finishing, a quarter of the WPM, +20/+10/+5 for a podium when there were opponents, +15 for the daily challenge), and the POST response includes `coinsEarned`. Races uploaded through the import endpoint pay out the same way; a guest's own browser-side balance is never trusted. `GET /api/users/me` returns `coins` and `owned` (the paid items bought). `PUT /api/users/me/cosmetics` refuses (`403`) to equip anything with a price that isn't owned.

Achievements pay too, once each (`achievements.go`). After every race the server checks the player's full history against the same rules the frontend shows (`frontend/src/lib/achievements.ts`), records newly unlocked ones in `user_achievements` and adds their reward from `achievement_rewards.json`. The race response lists them under `achievements`, `GET /api/users/me` returns all unlocked ids, and loading the profile also pays anything earned but not yet paid (back pay for achievements unlocked before rewards existed). Races may send `localHour` (0-23, the player's clock) for the Early bird / Night owl achievements.

Prices live in `shop_prices.json`, embedded into the binary. The frontend renders from an identical copy (`frontend/src/lib/shop/prices.json`), and `TestShopPricesMatchFrontend` fails if the two ever differ.

### `GET /api/leaderboards`

| Param    | Values                     | Default     |
| -------- | -------------------------- | ----------- |
| `board`  | `speed`, `daily`           | `speed`     |
| `period` | `day`, `week`, `all`       | `week`      |
| `scope`  | `global`, `friends`        | `global`    |
| `date`   | `YYYY-MM-DD` (daily board) | today (UTC) |

`speed` ranks each player's single best race in a rolling window (24 hours, 7 days or all time); `daily` ranks one day's daily-challenge results. Tied players share a rank. The response has the top 50 `entries` plus `me`, the caller's own row when they're ranked below the cut. Each entry includes `replayId` when the run that earned it has a replay. Only verified races are ranked: ones saved against a ticket, plus races from before tickets whose stored replay still passes the checks (re-checked once at startup, `backfill.go`). Imported races count for the player's own history only. `scope=friends` limits the board to the caller and their accepted friends and needs an identity.

### Friends

| Endpoint                                 | What it does                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/users/me/friends`              | `{friends, incoming, outgoing}`, each with display name, car, best WPM and race count           |
| `GET /api/users/search?q=`               | Up to 10 players whose name contains `q` (2–64 chars), each with its relationship to the caller |
| `POST /api/users/me/friends`             | `{"userId": "..."}`: sends a request, or accepts one if that player already asked               |
| `POST /api/users/me/friends/{id}/accept` | Accepts a pending request from `{id}`                                                           |
| `DELETE /api/users/me/friends/{id}`      | Unfriends, declines, or cancels — whichever relationship exists                                 |

Every mutation returns the updated `{friends, incoming, outgoing}`. A request is one directed row; a unique index on the unordered pair means two players sending each other requests at the same moment still end up with one relationship.

### `GET /api/replays/{id}`

A recorded race: `passage`, `events`, the race's stats, and the driver's display name, avatar and car. Public, so leaderboard rows can link to the run behind them. `404` for an unknown id or a race without a replay.

### `GET /health`

`200 {"status": "ok"}` if Postgres is reachable, `503` otherwise.
