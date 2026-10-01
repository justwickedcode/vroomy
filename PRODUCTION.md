# Production deployment

Covers the whole stack — Postgres, Redis, the crawler (`backend/scraper`), the quotes API
(`backend/api`), the real-time multiplayer WS service (`backend/ws`), and the frontend
(TanStack Start, via `frontend/Dockerfile`) — deployed together as one `docker-compose.prod.yml`
stack. The frontend is deployed alongside the backend here, not to its own separate host, for a
specific reason: see **"Isolating api behind the frontend"** below.

**`api` has no public domain at all.** The browser never talks to it directly — only the
frontend's own server does, over this compose network, via a `createServerFn`-based proxy (see
`frontend/src/lib/typing/sentences.ts`) configured with the plain runtime env var
`API_INTERNAL_URL=http://api:8080`. `ws` is still reachable at its own public `wss://` domain for
now (the browser connects to it directly) — proxying real-time WebSocket traffic through the
frontend's server is a separate, more involved piece of work than api's plain HTTP proxy, and
hasn't shipped yet.

`frontend` itself takes one build-time-looking env var the same way `ws`'s own domain does:
`VITE_WS_URL`, a full `wss://` URL. Vite only ever inlines `import.meta.env.VITE_*` at build
time, not runtime, but `VITE_WS_URL` is set here as an **ordinary runtime environment
variable** — `frontend/Dockerfile`'s build stage bakes in a fixed placeholder token instead of a
real value, and `frontend/docker-entrypoint.sh` substitutes the real runtime env var for that
placeholder across every built file the instant the container starts, before the server boots.
This exists specifically because plenty of PaaS UIs (Dokploy included) only ever expose
_runtime_ environment variables with no way to pass a real Docker build-arg through to
`docker build`, which would otherwise leave the dev fallback (`localhost`) silently baked in with
no error anywhere. `API_INTERNAL_URL` needs none of this — it's read fresh from `process.env`
inside a server-only `createServerFn` handler, which never runs in the browser, so there's
nothing to bake at build time in the first place.

Everything here was built and verified against a real, isolated instance of this exact stack —
not assumed to work from the compose file alone. Two real backend bugs were caught this way (see
"Findings from live testing" below), and the api proxy above was verified by running a real
mock `api` service with zero host-published port, reachable only by its container name on an
isolated Docker network, and confirming a real race actually fetched a quote through the
frontend's proxy with no direct network path from the browser to that container at all.

## Isolating api behind the frontend

Why this needs the frontend _in_ this compose file, not deployed separately: there is no way to
make a public backend service reachable "only by the frontend" while the **browser** still talks
to it directly — whatever URL a browser can reach, anyone can reach (copy it straight out of
devtools; no secret is involved). The only real fix is having the frontend's own server be the
one thing that ever talks to `api`, with `api` itself given no public domain at all — same model
as Postgres/Redis already had in this file before the frontend was added.

That in turn requires `api` and `frontend` to be able to reach each other by plain internal
DNS (`http://api:8080`), which **only works when they're deployed together as one compose
project** — see this file's Dokploy section below for why that's a hard platform requirement,
not just a preference.

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

This starts six containers on one internal Docker network — `postgres`, `redis`, `crawler`,
`api`, `ws`, `frontend` — all with `restart: unless-stopped`, so a crash or host reboot brings
them back automatically without anyone needing to notice and intervene manually. `postgres`,
`redis`, and now `api` are **not** exposed to the host at all (unlike the dev compose file, which
publishes Postgres/Redis for direct `psql`/`redis-cli` access) — only reachable from other
containers on this network, by service name.

The crawler self-migrates the database schema on startup (same as it does in dev); neither the
API nor `ws` ever migrates or writes, so make sure the crawler has started at least once against
a fresh database before relying on either of them.

## 4. Put real HTTPS (and WSS) in front of ws and the frontend

`ws` is published as `127.0.0.1:8081` and `frontend` as `127.0.0.1:3000` — both bound to
localhost only, deliberately not exposed publicly over plain HTTP. `api` has **no** published
port at all anymore (see "Isolating api behind the frontend" above) — there's nothing to put
HTTPS in front of. See `backend/ws/Caddyfile.example` and the new `frontend/Caddyfile.example`
for two-line Caddy configs (one site block each — they can live in the same Caddyfile) that get
you real, auto-renewing Let's Encrypt certificates once you have domains pointed at this host.
Set `VITE_WS_URL` in `.env.prod` to `ws`'s real domain (as `wss://...`, not `https://...`), and
`CORS_ALLOWED_ORIGIN` to the frontend's real domain — `ws` still reads it (the browser still
connects to `ws` directly for now); `api`'s own copy is effectively vestigial since no browser
request reaches it anymore, kept only as harmless defense-in-depth.

## 5. Set up backups

**If Postgres/Redis are managed by an orchestrator with its own backup scheduler (e.g. Dokploy's
built-in per-database scheduled backups to S3-compatible storage), use that instead of the
script below** — it already handles off-host storage and scheduling, which the script does not.
The script here is for a plain `docker compose` deployment with no orchestrator backing it:

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

## 6. Deploying via Dokploy

**Deploy this as a single Dokploy "Compose" project, using `docker-compose.prod.yml` as-is — not
as separate Dockerfile-type Applications, one per service.** This is a hard requirement, not a
style preference: Dokploy only gives automatic internal service-name DNS resolution (what lets
`frontend` reach `http://api:8080`) to services deployed together as one Compose project.
Separately-deployed standalone Applications each get their own isolated Docker network and
**cannot reach each other by name at all** — a currently-open Dokploy limitation
([Dokploy#3670](https://github.com/Dokploy/dokploy/issues/3670)). Deployed any other way, `api`'s
isolation from "Isolating api behind the frontend" above simply doesn't work: `frontend` would
fail to resolve `api` and every quote fetch would fall back to the local sentence pool.

Within that one Compose project, Dokploy still lets you configure a public **Domain** on
individual services, independently of each other:

- **`frontend` needs a Domain**, container **Port 3000**, and health-check path `/` (it has no
  dedicated `/health` route — the root route responding is the signal).
- **`ws` needs a Domain** too, for now — container **Port 8081**, health-check path `/health`.
  This goes away once ws is proxied through the frontend the same way `api` already is (not yet
  built — see this file's top section).
- **`api`, `crawler`, `postgres`, and `redis` get no Domain at all.** `crawler` never did (it's a
  background worker with no HTTP server — nothing for a reverse proxy to route to or poll); `api`
  now joins it deliberately, as the whole point of this setup.
- Set `CORS_ALLOWED_ORIGIN` and `VITE_WS_URL` as this Compose project's environment variables
  (the same two concepts `.env.prod` holds for the raw-Compose path) — `API_INTERNAL_URL` needs
  no separate configuration here at all, since it's already hardcoded as `http://api:8080`
  directly in `docker-compose.prod.yml` itself, which this deployment uses as-is.
- **`REDIS_ADDR` accepts Dokploy's internal Redis connection URL directly** (`redis://...`) —
  `ConnectRedis` (see finding #1 below) switches to URL parsing for anything containing `://`,
  so `REDIS_PASSWORD`/`REDIS_DB` env vars are unused in that case; only set `REDIS_ADDR`. Only
  the crawler uses Redis at all — api and ws only ever need `DATABASE_URL`.
- **Memory limits are already encoded in `docker-compose.prod.yml` itself** (each service's own
  `deploy.resources.limits.memory`), and Dokploy's Compose deployment reads that file directly —
  unlike the old separate-Applications approach, there's no need to re-enter these per service in
  Dokploy's UI. The table below is just what's already in the file, for reference (crawler sized
  for its real measured ~1.25GB working set — see finding #2 below — on top of Postgres/Redis
  running as separate containers instead of bundled with the crawler on one unconstrained host;
  api/ws/frontend are far lighter, no language models loaded — **frontend's figure specifically
  is an unmeasured starting point**, worth checking with `docker stats` under real traffic):

  | Service  | Limit  | Also set                                           |
  | -------- | ------ | -------------------------------------------------- |
  | crawler  | 2 GB   | `GOMEMLIMIT=1536MiB`                               |
  | api      | 128 MB | `GOMEMLIMIT=100MiB`                                |
  | ws       | 128 MB | `GOMEMLIMIT=100MiB`                                |
  | frontend | 256 MB | —                                                  |
  | postgres | 512 MB | —                                                  |
  | redis    | 256 MB | `--maxmemory 200mb --maxmemory-policy allkeys-lru` |

  If Dokploy's UI also exposes a separate Reservation (soft) field for Compose-deployed services,
  a reasonable soft target is roughly half of each hard Limit above — a bare single hard limit
  with no slack turns an ordinary transient spike into an unnecessary SIGKILL. **Redis
  specifically needs its own `--maxmemory` set** (already in the `command:` in
  `docker-compose.prod.yml`): unlike a limit enforced from outside, Redis has no built-in
  awareness of a cgroup memory cap and will keep allocating past it until the kernel OOM-killer
  SIGKILLs it ungracefully, rather than evicting keys on its own terms. `allkeys-lru` is safe here
  specifically because Redis is only an accelerator cache in this architecture (see
  `backend/scraper/README.md`'s "Redis simhash cache" section) — Postgres is the source of truth,
  so an evicted key just costs one missed near-duplicate check, not data loss.

- **A memory-limit kill is a blip here, not a real incident, by design**: `WarmSimhashCache` and
  `WarmFrontierCache` fully rehydrate Redis from Postgres on every restart, and
  `db.RequeueStuckInProgress` recovers any URL a killed process left stuck mid-fetch — both
  already exist for the ordinary case of the crawler process itself dying, and apply equally to
  an OOM-triggered container restart. Combined with `restart: unless-stopped`, the practical
  effect of hitting a limit is a few seconds of downtime, not lost work.
- **On a small host (e.g. 4-5GB total), add a swapfile** as a cheap way to reduce how often a
  transient spike escalates to an OOM-kill at all — the kernel pages out cold memory first
  instead of immediately SIGKILLing on hitting a hard limit:
  ```bash
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- **Day/night scheduling is handled by stopping and starting the crawler service itself**, not
  by anything inside the process. Previously this targeted a standalone crawler App by its stable
  ID via Dokploy's Scheduled Tasks; as part of one Compose project instead, check whether
  Scheduled Tasks can target a single service within the project the same way — if it can only
  toggle the whole project, that's coarser than before (it would also stop api/ws/frontend), and
  a plain scheduled `docker compose stop crawler` / `start crawler` on the host is the fallback.
  An earlier in-app pause-only approach (an active-hours env var) was tried and reverted: pausing
  the worker loops cut CPU/network but never freed the ~1.25GB RAM the crawler holds once its
  language-detection models are loaded, since that memory stays resident for the life of the
  process whether it's fetching or idle — only actually stopping the container frees it.
- **`LOG_LEVEL` cuts log volume at the source, on top of the disk-side cap below.** Three levels:
  `info` (unset, the default) is today's full output; `warn` drops the highest-volume routine
  narration (one line per page parsed, per quote saved, per URL discovered) but keeps every
  skip/retry/fallback line — a rejected quote, a low-yield category abandoned, a rate-limit
  backoff, a retry after a failed fetch — alongside real failures; `error` drops warnings too,
  down to genuine failures only (`Could not ...`, a fetch/DB error, giving up on a URL) — never
  suppressed at any level. **`error` is the recommended production setting** for a low-noise log
  — `warn` is there for when you actually want to see _why_ the crawler's doing what it's doing
  (rate-limited? skipping bad content? just quiet right now?) without the full per-item flood.
  `docker-compose.prod.yml` already sets `LOG_LEVEL: error` for the `crawler` service — no
  further action needed here since this deployment uses that file as-is. Leave it unset in dev
  if you want the full picture of what the crawler's doing.
- **Cap container log size, or the crawler's own logs can fill the disk.** Docker's default
  `json-file` log driver has no size limit — the crawler logs roughly one line per URL
  discovered/fetched (`internal/crawler/crawler.go`), so left running for weeks that adds up.
  `docker-compose.prod.yml` already caps every service at 10MB × 3 files via its `x-logging`
  anchor, and — unlike the old separate-Applications approach, where Dokploy's
  individually-managed Applications didn't read this file at all — **this now takes effect
  automatically**, since Dokploy's Compose deployment runs the file directly. A host-wide default
  is still worth setting for anything outside this project (Dokploy's own Traefik/dashboard
  containers, any other project on the same host) via `/etc/docker/daemon.json`:
  ```json
  {
    "log-driver": "json-file",
    "log-opts": { "max-size": "10m", "max-file": "3" }
  }
  ```
  ```bash
  sudo systemctl restart docker
  ```
  This only applies to _new_ containers — existing ones keep their old log config until
  recreated.

## What's already handled

- **Rate limiting** — api's one endpoint (`/api/quotes/random`) is limited to 30 requests/minute
  per IP (burst of 10), tracked via `X-Forwarded-For`'s first entry when present or the direct
  connection otherwise. Now that every request to api arrives from the frontend's own proxy, not
  a browser, the frontend forwards the `X-Forwarded-For` header its own incoming request arrived
  with (see `fetchRandomQuote` in `frontend/src/lib/typing/sentences.ts`) — without this, every
  visitor's request would show up as coming from the frontend container's own address, collapsing
  the per-visitor limit into one shared bucket for the whole site. `/health` is exempt — an
  orchestrator's own healthcheck polling it shouldn't be able to trip a limit meant for abuse, not
  routine monitoring. `ws`'s equivalent abuse control is a per-IP cap on concurrently-open
  connections (see `backend/ws/README.md`'s "Concurrent-connection limiting") rather than a
  request-rate limiter — a WebSocket connection is long-lived, not a discrete request a token
  bucket makes sense against; this one's unaffected since browsers still connect to `ws`
  directly for now.
- **Graceful shutdown** — the crawler, the API, and `ws` all stop cleanly on `SIGTERM` (what
  `docker stop` and Compose both send), finishing in-flight work rather than dying mid-request.
- **Health checks** — `postgres`/`redis`/`api`/`ws` all have Docker healthchecks; `crawler`
  doesn't expose one (it's a background worker, not a request-serving process — its own logs
  are the signal to watch, e.g. via `docker compose logs -f crawler`).

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
