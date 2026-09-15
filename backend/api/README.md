# quotes-api

A small read-only Go HTTP API serving quotes from the `backend/scraper` crawler's Postgres database, currently used for one thing: feeding the frontend's typing-race game real passages instead of its static placeholder pool (see `frontend/src/lib/typing/sentences.ts`).

## Why Go, not Elysia/Hono

The original plan here (see git history) was a TypeScript API using Elysia or Hono. That changed once the actual use case became concrete: this API only needs to read quotes the scraper already collected, using a schema and word-count filtering logic the scraper's own Go code already defines. Rebuilding that in a second language/runtime — a new Postgres client, a new understanding of what makes a quote "typing-race-eligible" — would have been pure duplication for zero benefit, since this service does nothing beyond query and reshape data the scraper already owns.

If a broader REST API (auth, other resources, a real API for the whole app) becomes needed later, that's a fair reason to revisit the stack — Elysia/Hono are still perfectly reasonable choices for that. This one just didn't need it.

## Relationship to backend/scraper

This is a **separate Go module** (its own `go.mod`), not a package inside `backend/scraper` — Go's `internal/` visibility rules mean it couldn't import `backend/scraper`'s internal packages even if it wanted to, and it doesn't need to: it only needs a Postgres connection and a couple of read queries, both trivial to have directly.

- **Database**: points at the _same_ Postgres instance `backend/scraper` writes to (see `.env` — `DATABASE_URL`), not a separate one. Run `backend/scraper`'s own `docker-compose.yml` to get that database running.
- **Schema/migrations**: owned entirely by `backend/scraper`. This API never runs migrations and never writes — run the scraper at least once against a fresh database before starting this API, so the `quotes` table (and its `word_count` column, which this API's filtering depends on) actually exists.
- **`word_count`**: a column `backend/scraper`'s `db.SaveQuote` computes and stores on every quote at write time (indexed alongside `language`) — this API filters on it directly rather than re-splitting every candidate row's text on every request.

## Running it

```bash
go run .
```

Reads `.env` for `DATABASE_URL`, `API_PORT` (default `8080`), and `CORS_ALLOWED_ORIGIN` (default `http://localhost:3000`, i.e. the frontend's dev server). `.env` is optional — if it's just not present (e.g. running in a container, where config comes from the environment directly), that's not an error; only a genuinely malformed `.env` file that does exist is fatal.

For a production deployment (Docker, a reverse proxy for real HTTPS, backups of the shared database) see `../../PRODUCTION.md` at the repo root.

## Rate limiting

`GET /api/quotes/random` is limited to 30 requests/minute per IP (burst of 10) — see `ratelimit.go`. This API has no accounts or API keys (it's called directly from any visitor's browser), so per-IP limiting is the only practical abuse control available; it's sized generously for real gameplay (one new sentence per race, roughly every 10-60+ seconds) and exists to stop a script hammering the endpoint, not to throttle real players. `/health` is exempt, since an orchestrator's own healthcheck polling it every few seconds shouldn't be able to trip a limit meant for abuse.

Prefers `X-Forwarded-For`'s first entry when present (set this correctly in your reverse proxy — see `PRODUCTION.md`), falling back to the direct connection's address for local dev where there's no proxy in front.

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

### `GET /health`

`200 {"status": "ok"}` if Postgres is reachable, `503` otherwise.
