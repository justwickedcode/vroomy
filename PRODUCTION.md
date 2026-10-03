# Production deployment

One file, `docker-compose.yml` at the repo root, deploys `crawler` (`backend/scraper`), `api`
(`backend/api`), `ws` (`backend/ws`), and `frontend` (TanStack Start, via `frontend/Dockerfile`)
together. It deliberately has **no** `postgres`/`redis` service blocks — this deploys against
Postgres and Redis that already exist elsewhere (e.g. Dokploy Database resources you manage and
back up separately), via `DATABASE_URL`/`REDIS_ADDR`. The frontend is bundled in with the
backend, not deployed to its own separate host, for a specific reason: see **"Isolating api
behind the frontend"** below.

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
not assumed to work from the compose file alone. Several real bugs were caught this way (see
"Findings from live testing" below), and the api proxy above was verified by running a real
mock `api` service with zero host-published port, reachable only by its container name on an
isolated Docker network, and confirming a real race actually fetched a quote through the
frontend's proxy with no direct network path from the browser to that container at all.

## Isolating api behind the frontend

Why this needs the frontend _in_ this compose file, not deployed separately: there is no way to
make a public backend service reachable "only by the frontend" while the **browser** still talks
to it directly — whatever URL a browser can reach, anyone can reach (copy it straight out of
devtools; no secret is involved). The only real fix is having the frontend's own server be the
one thing that ever talks to `api`, with `api` itself given no public domain at all.

That in turn requires `api` and `frontend` to be able to reach each other by plain internal
DNS (`http://api:8080`), which **only works when they're deployed together as one compose
project** — see "Deploying via Dokploy" below for why that's a hard platform requirement, not
just a preference.

## 1. Required environment variables

```
DATABASE_URL          — your existing Postgres connection string
REDIS_ADDR            — your existing Redis connection string (redis://... form is fine
                         directly — see "Deploying via Dokploy" below)
CORS_ALLOWED_ORIGIN   — the frontend's real public domain (e.g. https://vroomy.example.com)
VITE_WS_URL           — ws's real public wss:// domain (e.g. wss://ws.vroomy.example.com)
PUBLIC_URL            — same as CORS_ALLOWED_ORIGIN, no trailing slash — builds the OIDC
                         redirect_uri (.../auth/callback); must exactly match a Redirect URI
                         registered on the identity provider's client — see "Authentication" below
OIDC_ISSUER           — the identity provider's own URL, including any realm/org path it needs
                         (e.g. https://auth.example.com/realms/apps for Keycloak) — see below
OIDC_CLIENT_ID        — Vroomy's client/application ID in the identity provider
OIDC_CLIENT_SECRET    — Vroomy's client secret in the identity provider
SESSION_SECRET        — random, >=32 chars (e.g. `openssl rand -base64 48`) — seals Vroomy's own
                         login-session cookie; never reuse across environments
```

`.env.example` documents the same four vars — copy it to `.env.prod` and fill in real values if
deploying with plain `docker compose` rather than Dokploy (`.env.prod` is gitignored, never
committed). **Never reuse dev placeholder values** here; `backend/scraper`'s own local-dev
`docker-compose.yml` is a completely separate, unrelated Postgres/Redis instance from whatever
you point `DATABASE_URL`/`REDIS_ADDR` at here.

## 2. Bring up the stack (plain `docker compose`, no Dokploy)

```bash
docker compose --env-file .env.prod up -d --build
docker compose --env-file .env.prod logs -f
```

All four containers run with `restart: unless-stopped`, so a crash or host reboot brings them
back automatically. `api` has no host-published port at all — only reachable from other
containers on this compose network, by service name. `frontend`/`ws` also publish nothing to the
host by default (see "Deploying via Dokploy" below for why) — if running this outside Dokploy,
front them yourself with a reverse proxy (see `backend/ws/Caddyfile.example` and
`frontend/Caddyfile.example` for two-line Caddy configs that get real, auto-renewing Let's
Encrypt certs) proxying to each container's own address on this compose network.

The crawler self-migrates the database schema on startup (same as it does in dev); neither the
API nor `ws` ever migrates or writes, so make sure the crawler has started at least once against
a fresh database before relying on either of them.

## 3. Set up backups

**If Postgres/Redis are managed by an orchestrator with its own backup scheduler (e.g. Dokploy's
built-in per-database scheduled backups to S3-compatible storage), use that instead of the
script below** — it already handles off-host storage and scheduling, which the script does not.
The script here is for a Postgres you're managing yourself with no orchestrator backing it:

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
to push each dump to object storage.

## 4. Deploying via Dokploy

**Deploy `docker-compose.yml` as a single Dokploy "Compose" project — not as separate
Dockerfile-type Applications, one per service.** This is a hard requirement, not a style
preference: Dokploy only gives automatic internal service-name DNS resolution (what lets
`frontend` reach `http://api:8080`) to services deployed together as one Compose project.
Separately-deployed standalone Applications each get their own isolated Docker network and
**cannot reach each other by name at all** — a currently-open Dokploy limitation
([Dokploy#3670](https://github.com/Dokploy/dokploy/issues/3670)). Deployed any other way, `api`'s
isolation from "Isolating api behind the frontend" above simply doesn't work: `frontend` would
fail to resolve `api` and every quote fetch would fall back to the local sentence pool.

**Postgres/Redis Database resources run as Docker Swarm services on Dokploy's shared
`dokploy-network` overlay network — not whatever network a plain Compose deploy creates by
default.** `docker-compose.yml`'s `networks.default` is pinned to `dokploy-network` (`external:
true`) specifically so this project lands on the same network your existing Database resources
are already on; without this, `DATABASE_URL`/`REDIS_ADDR` hostnames fail to resolve at all (a
DNS lookup failure, not an auth/connection-refused error — easy to misdiagnose as a credentials
problem when it's actually a networking one). Find your own Database resource's network with
`docker service ls` and `docker network ls` on the host if you're ever unsure it's really
`dokploy-network`.

Within the Compose project, Dokploy lets you configure a public **Domain** per service,
independently of each other:

- **`frontend` needs a Domain**, container **Port 3000**, health-check path `/` (it has no
  dedicated `/health` route — the root route responding is the signal).
- **`ws` needs a Domain** too, for now — container **Port 8081**, health-check path `/health`.
  This goes away once ws is proxied through the frontend the same way `api` already is (not yet
  built — see this file's top section).
- **`api` and `crawler` get no Domain at all.** `crawler` never did (it's a background worker
  with no HTTP server — nothing for a reverse proxy to route to or poll); `api` is deliberately
  unexposed, the whole point of this setup.
- `docker-compose.yml` deliberately has no `ports:` host-publish on `frontend`/`ws` — Dokploy's
  Traefik routes to them directly over `dokploy-network` based on the Domain config above, so
  publishing a host port isn't needed the way it is for the plain-`docker compose`+Caddy path in
  step 2. **Port 3000 specifically must stay unpublished** — it collides with Dokploy's own
  dashboard, which already owns that host port.
- Set the four env vars from "Required environment variables" above as this Compose project's
  environment variables, under Dokploy's **Environment Settings** tab. Make sure **"Create
  Environment File"** is enabled there — if it's off, the values you type are saved in Dokploy's
  own database but never written to an actual `.env` file next to the compose file, so every
  `${VAR}` in it silently resolves to an empty string with no error anywhere (confirmed live:
  `api` crash-looped with `user=root database=` — pgx's fallback for a genuinely empty connection
  string — until this was switched on and redeployed). Editing/saving these values alone doesn't
  retroactively change already-running containers either — trigger an actual redeploy after
  saving, since `restart: unless-stopped` just keeps recreating the _same_ crashed container with
  its old baked-in env otherwise.
- **`REDIS_ADDR` accepts Dokploy's internal Redis connection URL directly** (`redis://...`) —
  `ConnectRedis` (see finding #1 below) switches to URL parsing for anything containing `://`,
  so `REDIS_PASSWORD`/`REDIS_DB` env vars are unused in that case; only set `REDIS_ADDR`. Only
  the crawler uses Redis at all — api and ws only ever need `DATABASE_URL`.
- **Memory limits are already encoded in `docker-compose.yml` itself** (each service's own
  `deploy.resources.limits.memory`), and Dokploy's Compose deployment reads that file directly —
  no need to re-enter these per service in Dokploy's UI. The table below is just what's already
  in the file, for reference (crawler sized for its real measured ~1.25GB working set — see
  finding #2 below; api/ws/frontend are far lighter, no language models loaded — **frontend's
  figure specifically is an unmeasured starting point**, worth checking with `docker stats`
  under real traffic):

  | Service  | Limit  | Also set             |
  | -------- | ------ | -------------------- |
  | crawler  | 2 GB   | `GOMEMLIMIT=1536MiB` |
  | api      | 128 MB | `GOMEMLIMIT=100MiB`  |
  | ws       | 128 MB | `GOMEMLIMIT=100MiB`  |
  | frontend | 256 MB | —                    |

  If Dokploy's UI also exposes a separate Reservation (soft) field for Compose-deployed services,
  a reasonable soft target is roughly half of each hard Limit above — a bare single hard limit
  with no slack turns an ordinary transient spike into an unnecessary SIGKILL.

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
  by anything inside the process. As part of one Compose project, check whether Dokploy's
  Scheduled Tasks can target a single service within the project — if it can only toggle the
  whole project, that's coarser (it would also stop api/ws/frontend), and a plain scheduled
  `docker compose stop crawler` / `start crawler` on the host is the fallback. An earlier
  in-app pause-only approach (an active-hours env var) was tried and reverted: pausing the
  worker loops cut CPU/network but never freed the ~1.25GB RAM the crawler holds once its
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
  `docker-compose.yml` already sets `LOG_LEVEL: error` for the `crawler` service. Leave it unset
  in dev if you want the full picture of what the crawler's doing.
- **Cap container log size, or the crawler's own logs can fill the disk.** Docker's default
  `json-file` log driver has no size limit — the crawler logs roughly one line per URL
  discovered/fetched (`internal/crawler/crawler.go`), so left running for weeks that adds up.
  `docker-compose.yml` already caps every service at 10MB × 3 files via its `x-logging` anchor,
  and this takes effect automatically since Dokploy's Compose deployment runs the file directly.
  A host-wide default is still worth setting for anything outside this project (Dokploy's own
  Traefik/dashboard containers, any other project on the same host) via `/etc/docker/daemon.json`:
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

## 5. Authentication (OIDC via Keycloak)

Login is handled by a self-hosted **Keycloak** instance, shared across projects — not something
`docker-compose.yml` deploys itself; it's a separate standing service, currently at
`https://auth.justwickedcode.dev`, realm **`apps`** (a deliberately generic realm name, not
`vroomy` — the plan is every future project registers its own client in this same realm, sharing
one user base/login session across all of them, per the original "unified login" goal).

`frontend/src/lib/auth/oidc.ts` is provider-agnostic on purpose — it reads every endpoint
(authorize/token/jwks/userinfo) from the provider's own `/.well-known/openid-configuration`
discovery document rather than hardcoding them, and uses only standard OIDC claim names
(`sub`/`name`/`email`/`picture`). This code was built against Casdoor, then Zitadel, then
Keycloak over one long session — each switch needed zero code changes beyond env vars, which is
exactly what this design is for. If you ever switch providers again, same expectation applies.

### Adding a new project's client to this same Keycloak realm

1. `https://auth.justwickedcode.dev` → log in as admin → confirm you're in the **`apps`** realm
   (top-left dropdown) — never configure real users in the `master` realm, that's Keycloak's own
   admin account only
2. **Clients → Create client** → Client ID = your new project's name → **Client authentication:
   On** (confidential client, gets a real secret — not a public/PKCE-only client) → Next →
   **Valid redirect URIs**: `https://<your-project-domain>/auth/callback` → Save
3. **Credentials** tab → copy the Client Secret
4. Set that project's own `OIDC_ISSUER=https://auth.justwickedcode.dev/realms/apps`,
   `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` env vars
5. GitHub/Google providers are already configured at the realm level (**Identity providers** in
   the console) — every client in this realm gets them automatically, no per-client setup needed

### Known gotchas, found live

- **`OIDC_ISSUER` must include the realm path, not just the bare domain**
  (`.../realms/apps`, not just `https://auth.justwickedcode.dev`) — `oidc.ts`'s discovery fetch
  was originally written as `new URL('/.well-known/...', issuerBase())`, which silently drops
  any path component already on the issuer URL (a leading `/` in the relative argument resets
  to domain root instead of appending). Invisible with Casdoor/Zitadel (bare-domain issuers,
  nothing to lose) until Keycloak's realm-scoped issuer hit it directly — fixed with plain string
  concatenation instead of relative `URL` resolution. If a future provider's issuer also has a
  path component, this is already handled; nothing to redo.
- **Keycloak's `firstName`/`lastName` are "root attributes" and cannot be deleted**, only
  reconfigured — Realm settings → User profile → click the attribute → turn off "Required field"
  and uncheck "User" under Permissions (both view and edit) to fully hide it from every
  user-facing flow, including the GitHub/Google first-login screen. Vroomy never reads these
  fields anyway (only the combined `name`/`email` claims), so hiding them costs nothing.
- **Cloudflare bot-protection rules must explicitly exempt the VPS's IP for every new auth
  subdomain** — a rule written against one subdomain doesn't automatically cover another, even
  with a broad `http.host contains "yourdomain.dev"` match, if the rule was created before that
  subdomain existed. `api`/`frontend`'s own server-to-server calls to the identity provider
  (token exchange, JWKS fetch, discovery) run from the VPS and will get Cloudflare-challenged
  exactly like a browser-less `curl` would if this isn't set up — this is a real production
  blocker, not just a local-testing inconvenience, since Vroomy's actual login flow depends on
  these same calls succeeding.
- **Dokploy's "Create Environment File" toggle must be on**, and env var changes need an actual
  **redeploy** (not just saving settings) to reach the running container — bit us more than once
  across this whole stack, not just auth.

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
- **Health checks** — `api`/`ws`/`frontend` all have Docker healthchecks; `crawler` doesn't
  expose one (it's a background worker, not a request-serving process — its own logs are the
  signal to watch, e.g. via `docker compose logs -f crawler`).

## Findings from live testing (read before assuming this "just works")

Real, non-obvious bugs/gotchas caught by actually running this stack end-to-end in a real
Dokploy deployment, not by reasoning about the code:

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
   stable working set plateaus at ~1.25GB. `docker-compose.yml`'s `crawler` service is sized at
   a 2G hard limit with `GOMEMLIMIT=1536MiB` — both **measured empirically** (memory limit
   removed entirely, real usage observed over a sustained run) rather than guessed. An earlier
   attempt set both values far below this real number, which didn't prevent OOM kills — it just
   made the GC fight a losing battle to stay under an impossibly small target, burning 400-600%
   CPU in the process before still eventually hitting the wall. `GOMEMLIMIT` only helps once
   it's set _above_ actual need, giving the GC real slack to collect proactively.
3. **A plain Compose deploy lands on its own isolated network by default, not Dokploy's shared
   one.** Dokploy Database resources (Postgres/Redis) run as Swarm services on `dokploy-network`;
   a Compose project with no `networks:` override gets its own fresh `<project>_default` bridge
   network instead, which has no route to them at all — `DATABASE_URL`/`REDIS_ADDR` hostnames
   then fail DNS resolution outright. Fixed by pinning `networks.default` to the external
   `dokploy-network` in `docker-compose.yml`. `dokploy-network` is created `Attachable: true`,
   so a plain (non-Swarm-service) Compose container can join it.
4. **`wget --spider http://localhost:PORT/` inside the `frontend`/`ws` containers failed with
   `Connection refused`, even though the exact same request from a different container on the
   same network succeeded.** Alpine/musl's `wget` resolving `localhost` prefers the IPv6 loopback
   (`::1`) first; Bun/Nitro (and `ws`) only bind IPv4 `0.0.0.0`, so nothing listens on `::1` and
   the healthcheck gets a real connection-refused. An unhealthy `frontend`/`ws` then gets skipped
   by Dokploy's routing entirely, surfacing as a confusing plain-text `404 page not found` at the
   real domain (that exact wording is Go's `net/http` default 404 — a strong tell the request
   actually landed on `api`'s router instead, worth checking the Domain's Service Name field
   first if you see it). Fixed by pointing both healthchecks at `127.0.0.1` instead of
   `localhost`, forcing IPv4 and sidestepping the ambiguity.
5. **Dokploy's dashboard itself listens on host port 3000** — the same default port
   `frontend` uses. Publishing `frontend`'s port to the host (`ports: - '127.0.0.1:3000:3000'`,
   needed for the plain-`docker compose`+Caddy path) collides with it under Dokploy. Dokploy's
   own Traefik doesn't need a host-published port at all — it routes to containers directly over
   `dokploy-network` based on the Domain config — so `docker-compose.yml` omits `ports:` on
   `frontend`/`ws` entirely now, and a would-be bind conflict never comes up under Dokploy. Only
   add a host-port mapping back if deploying with plain `docker compose` + your own reverse proxy
   (step 2 above), on a host that isn't also running Dokploy's dashboard on the same port.

If you change what the crawler does (add a source, change filters) in a way that could shift its
memory profile, re-verify rather than assuming these numbers still hold — the method that found
them (`docker stats` against an unconstrained container over a sustained run) is quick to repeat.
