# Production deployment

Covers the backend only — Postgres, Redis, the crawler (`backend/scraper`), and the quotes API
(`backend/api`). The frontend (TanStack Start) is deployed separately (Vercel/Netlify/a Node
host); it just needs `VITE_API_URL` pointed at wherever the API ends up.

Everything here was built and verified against a real, isolated instance of this exact stack —
not assumed to work from the compose file alone. Two real bugs were caught this way (see
"Findings from live testing" below) that would otherwise have only surfaced after a real
deployment.

## 1. Prerequisites

- Docker + Docker Compose v2 (`docker compose`, not the old `docker-compose` v1) on the host.
- A domain name pointed at the host, if you want a public HTTPS endpoint (see step 4).

## 2. Configure secrets

```bash
cp .env.example .env.prod
```

Edit `.env.prod` and replace every placeholder with a real, randomly-generated value —
`openssl rand -base64 24` is a quick way to generate one. **Never reuse the dev placeholder
values** (`postgres`/`postgres`, `redis`) here; those are fine only for `backend/scraper`'s own
local-dev `docker-compose.yml`, which is a completely separate, unrelated Postgres/Redis
instance from this one.

`.env.prod` is gitignored — it never gets committed.

## 3. Bring up the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
```

This starts four containers on one internal Docker network — `postgres`, `redis`, `crawler`,
`api` — all with `restart: unless-stopped`, so a crash or host reboot brings them back
automatically without anyone needing to notice and intervene manually. `postgres` and `redis`
are **not** exposed to the host at all (unlike the dev compose file, which publishes both for
direct `psql`/`redis-cli` access) — only reachable from other containers on this network.

The crawler self-migrates the database schema on startup (same as it does in dev); the API
never migrates and never writes, so make sure the crawler has started at least once against a
fresh database before relying on the API.

## 4. Put real HTTPS in front of the API

`api` is published as `127.0.0.1:8080` — bound to localhost only, deliberately not exposed
publicly over plain HTTP. See `backend/api/Caddyfile.example` for a two-line Caddy config that
gets you a real, auto-renewing Let's Encrypt certificate once you have a domain pointed at this
host. Point the frontend's `VITE_API_URL` at that HTTPS domain, and set `CORS_ALLOWED_ORIGIN`
in `.env.prod` to the frontend's real deployed URL.

## 5. Set up backups

```bash
export POSTGRES_USER=quotes POSTGRES_DB=quotes POSTGRES_CONTAINER=quotes-postgres
./backend/scraper/scripts/backup.sh
```

Dumps to `./backups/quotes_<timestamp>.sql.gz` and prunes anything older than 14 days
(`RETENTION_DAYS`, `BACKUP_DIR` are both overridable). Schedule it — a cron entry works fine:

```cron
0 3 * * * cd /path/to/vroomy && POSTGRES_USER=quotes POSTGRES_DB=quotes POSTGRES_CONTAINER=quotes-postgres ./backend/scraper/scripts/backup.sh >> /var/log/quotes-backup.log 2>&1
```

This writes to local disk only — for real disaster recovery (surviving the host itself being
lost), `BACKUP_DIR` should point somewhere that's itself synced offsite, or the script extended
to push each dump to object storage. Not built in here since the right destination depends on
where you're actually deploying, not something worth guessing at.

## What's already handled

- **Rate limiting** — the API's one public endpoint (`/api/quotes/random`) is limited to 30
  requests/minute per IP (burst of 10), tracked via `X-Forwarded-For` when present (set this
  correctly in your reverse proxy config) or the direct connection otherwise. `/health` is
  exempt — an orchestrator's own healthcheck polling it shouldn't be able to trip a limit meant
  for abuse, not routine monitoring.
- **Graceful shutdown** — both the crawler and the API stop cleanly on `SIGTERM` (what `docker
stop` and Compose both send), finishing in-flight work rather than dying mid-request.
- **Health checks** — `postgres`/`redis`/`api` all have Docker healthchecks; `crawler` doesn't
  expose one (it's a background worker, not a request-serving process — its own logs are the
  signal to watch, e.g. via `docker compose logs -f crawler`).

## Findings from live testing (read before assuming this "just works")

Two real, non-obvious bugs were caught by actually running this stack end-to-end in an isolated
test environment, not by reasoning about the code:

1. **`REDIS_ADDR=redis:6379` silently connected to the wrong host.** `redis.ParseURL("redis:6379")`
   doesn't error — it parses `"redis"` as a URL _scheme_ and produces `Addr="localhost:6379"`,
   discarding the real host entirely. This was invisible in every local dev run only because
   `REDIS_ADDR` has always literally _been_ `localhost:6379` there — the same wrong answer, by
   coincidence. Fixed in `internal/db/redis.go` (`ConnectRedis` now only attempts URL parsing
   for input that actually contains `://`).
2. **The crawler's real memory need is ~1.25GB, not the ~250MB first assumed.** The language
   detector added for language verification (see `backend/scraper/README.md`) loads statistical
   models into memory; even restricted to Latin-script languages only (~330MB, down from ~1GB
   for the full 75-language set), combined with normal crawling overhead the container's real,
   stable working set plateaus at ~1.25GB. `docker-compose.prod.yml`'s `crawler` service is
   sized at a 2G hard limit with `GOMEMLIMIT=1536MiB` — both **measured empirically** (memory
   limit removed entirely, real usage observed over a sustained run) rather than guessed. An
   earlier attempt set both values far below this real number, which didn't prevent OOM kills —
   it just made the GC fight a losing battle to stay under an impossibly small target, burning
   400-600% CPU in the process before still eventually hitting the wall. `GOMEMLIMIT` only helps
   once it's set _above_ actual need, giving the GC real slack to collect proactively.

If you change what the crawler does (add a source, change filters) in a way that could shift its
memory profile, re-verify rather than assuming these numbers still hold — the method that found
them (`docker stats` against an unconstrained container over a sustained run) is quick to repeat.
