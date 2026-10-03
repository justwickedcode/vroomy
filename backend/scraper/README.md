# quotes-crawler

A scalable web crawler that collects quotes from multiple sources and stores them in PostgreSQL.

## Sources

This project runs on Goodreads plus fourteen Wikiquote language editions — rather than spreading across every quote site that exists. All are plain Go (`net/http` + goquery), no JS rendering, no bypass of anything. Everything else considered was either cut for cause (see below) or just isn't a priority next to Goodreads' scale.

| Source                                                                                                                               | Method     | Status     | Notes                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GoodReads](https://goodreads.com/quotes)                                                                                            | Crawler    | ✅ Done    | Official sitemap ≈ 5.5M quote URLs. No hard block, but soft-throttles sustained sequential crawling — see note below. Primary volume source.                                                                                                                                                                                                       |
| [Wikiquote](https://en.wikiquote.org)                                                                                                | Crawler    | ✅ Done    | No anti-bot wall (verified live); parses rendered author-page HTML (not wikitext). Self-sustaining primarily via a real MediaWiki title-discovery side channel, supplemented by citation-link `NextURLs` and a random-page fallback — see note below.                                                                                              |
| [Wikiquote (German)](https://de.wikiquote.org)                                                                                       | Crawler    | ✅ Done    | Same MediaWiki infrastructure as English Wikiquote, reused via the generalized `wikiquoteSite` discovery mechanism (`internal/crawler/wikiquote_discovery.go`), but a structurally different page layout needed its own parser (`internal/parser/germanwikiquote.go`) — see note below. Tags saved quotes `language='de'`.                         |
| Wikiquote (French / Spanish / Italian / Portuguese / Polish / Swedish / Romanian / Czech / Hungarian / Danish / Norwegian / Finnish) | Crawler    | ✅ Done    | Same `wikiquoteSite` discovery mechanism, one shared parser (`internal/parser/wikiquote_i18n.go`, `LocalizedWikiquoteParser`) — see "Localized Wikiquote editions" below for why these share one implementation instead of one file each, and its known per-article noise tradeoff. Dutch was checked and deliberately skipped — see that section. |
| [quotes.toscrape.com](https://quotes.toscrape.com)                                                                                   | Test infra | ✅ Done    | Not a corpus source — a public scraping sandbox kept solely as the live-fetch integration test target.                                                                                                                                                                                                                                             |
| [Kaggle Dataset](https://www.kaggle.com/datasets/akmittal/quotes-dataset)                                                            | CSV Import | ⬜ Planned | Dataset page confirmed live; download needs a Kaggle account/API token (auth, not scraping). 500k+ claimed, unverified until downloaded.                                                                                                                                                                                                           |

## Stack

- **Language:** Go
- **Database:** PostgreSQL
- **Migrations:** Goose
- **HTML Parsing:** goquery
- **Queue:** Redis + Asynq (planned)

## Deployment

`Dockerfile` builds a static binary in a multi-stage build (no CGO, migrations embedded via `//go:embed` — no separate files to copy into the runtime image). For a real production deployment (docker-compose stack alongside `backend/api`, secrets, backups, reverse proxy for the API's HTTPS) see `../../PRODUCTION.md` at the repo root — it documents two real bugs a from-scratch containerized run caught live, worth reading before assuming this "just works" in a container:

- **`ConnectRedis` used to silently connect to the wrong host** for a plain `host:port` address like a Docker service name (`redis:6379`) — invisible in local dev only because `REDIS_ADDR` there has always literally _been_ `localhost:6379`. Fixed in `internal/db/redis.go`.
- **Real memory need is ~1.25GB**, not a naive guess — the language detector (see "Real language verification" below) loads statistical models into memory, and the actual stable working set was measured live (container memory limit removed, usage observed over a sustained run), not assumed from first principles.

## Architecture

```
cmd/
├── crawler/        → crawler binary
internal/
├── crawler/        → crawler.Run() orchestration
├── fetcher/        → HTTP logic + rate limiting
├── parser/         → site-specific parsers (interface + implementations)
├── dedup/          → normalization, SHA256, simhash, hamming distance
├── scoring/        → URL priority scoring
└── db/             → postgres connection, migrations, storage
```

## Deduplication

Two-layer dedup system to prevent both exact and near-duplicate quotes from entering the DB.

```
new quote
    │
    ├─ normalize + strip quote chars (dedup.Normalize, dedup.StripQuoteChars)
    │
    ├─ SHA256 match? → exact duplicate → discard        ✅ implemented
    │   (ON CONFLICT DO NOTHING in SaveQuote)
    │
    └─ Hamming distance < threshold? → near duplicate → discard   ✅ implemented
        (LSH banding in Redis, Hamming check on candidates only)
```

### What's built

| Function                   | Status  | Notes                                                   |
| -------------------------- | ------- | ------------------------------------------------------- |
| `dedup.Normalize`          | ✅ Done | Lowercase, strip punctuation, whitespace                |
| `dedup.StripQuoteChars`    | ✅ Done | Strips `"` `"` `"` `«` `»` before saving                |
| `dedup.SHA256`             | ✅ Done | Exact duplicate fingerprint                             |
| `dedup.Simhash`            | ✅ Done | Near-duplicate fingerprint                              |
| `dedup.HammingDistance`    | ✅ Done | Bit distance between two simhashes                      |
| `dedup.ExtractBands`       | ✅ Done | LSH banding — splits simhash into 4 × 16-bit bands      |
| Exact dedup in `SaveQuote` | ✅ Done | `ON CONFLICT (sha256_hash) DO NOTHING`                  |
| Near-dedup via Redis LSH   | ✅ Done | Band lookup → candidate set → Hamming check             |
| `WarmSimhashCache`         | ✅ Done | Loads all simhashes from Postgres into Redis on startup |

### Redis simhash cache

```
on startup → WarmSimhashCache: load all simhashes from Postgres → Redis Sets (LSH bands)
on insert  → check Hamming distance against Redis candidates only (~0.1ms vs ~20ms Postgres)
on save    → write to Postgres + add simhash bands to Redis

Redis restart → always re-warm from Postgres (source of truth)
```

Memory cost: ~5-10MB for 100k quotes (simhash = int64 = 8 bytes per quote).

### LSH Banding

Instead of checking every stored simhash, the 64-bit simhash is split into 4 bands of 16 bits each. Similar quotes will share at least one band, so only candidates from matching buckets are Hamming-checked.

```
simhash (64 bits) → band0 | band1 | band2 | band3  (16 bits each)
each band → Redis key: simhash:band:<n>:<value>
new quote → lookup 4 keys → collect candidates → Hamming check only on candidates
```

At 10M quotes: ~152 Hamming checks per insert instead of 10M.

## Tests

| Package           | Coverage | Notes                                                   |
| ----------------- | -------- | ------------------------------------------------------- |
| `internal/dedup`  | 96.6%    | All core functions covered                              |
| `internal/parser` | 91.7%    | Parser tested against fixture HTML                      |
| `internal/db`     | 64.2%    | SaveQuote tested with testcontainers (Postgres + Redis) |

Tests use [testcontainers-go](https://github.com/testcontainers/testcontainers-go) to spin up isolated Postgres and Redis containers — no manual setup needed.

```bash
go test ./...               # run all tests
go test -v ./...            # verbose output
go test -cover ./...        # with coverage
```

### Live integration tests

`internal/crawler/integration_test.go` (build tag `integration`) runs against the project's own `docker-compose.yml` Postgres + Redis instead of testcontainers, and includes three tests that do a real HTTP fetch against the live internet (`goodreads.com`, `quotes.toscrape.com`, `en.wikiquote.org`) — no fixtures, no mocking — parsing real pages, saving real quotes, and (for Goodreads and toscrape) pushing a real discovered URL into the Redis `frontier` ZSET.

```bash
docker compose up -d
go test -tags=integration -count=1 ./internal/crawler/... -v
docker compose down
```

State persists in the compose volumes across runs by design (dev env) — the tests are idempotent (dedup on quotes, `ON CONFLICT DO NOTHING` on URLs).

## URL Frontier

The crawler maintains a **URL frontier** — a persistent priority queue of URLs to crawl. PostgreSQL is the source of truth; Redis is the working queue.

### url_frontier table

```sql
CREATE TYPE crawl_status AS ENUM ('pending', 'in_progress', 'done', 'failed');

CREATE TABLE url_frontier (
    id              BIGSERIAL PRIMARY KEY,
    url             TEXT            NOT NULL UNIQUE,
    source          TEXT            NOT NULL,
    priority        FLOAT           NOT NULL,
    depth           INT             NOT NULL DEFAULT 0,
    status          crawl_status    NOT NULL DEFAULT 'pending',
    error_count     INT             NOT NULL DEFAULT 0,
    last_crawled_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_url_frontier_status_priority ON url_frontier(status, priority);
```

### Flow

```
Seed URLs → INSERT into url_frontier (status=pending)
                ↓
On startup  → load all pending rows → ZADD into their per-source Redis Sorted Set
                ↓
Crawl loop → round-robin across sources (see below) → ZPOPMIN from whichever source's turn
             it is → fetch page → mark status=in_progress in DB
                ↓
Parser      → extract quotes + discover next-page URLs
                ↓
Quotes      → quotes table
New URLs    → INSERT INTO url_frontier ON CONFLICT DO NOTHING + ZADD into that source's Redis set
                ↓
Mark URL    → status=done or status=failed (increment error_count)
```

On Redis restart → reload all `status=pending` rows from DB back into Redis (same pattern as `WarmSimhashCache`).

### Storage functions

| Function                                       | Status  | Notes                                                                                                                                         |
| ---------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `db.SaveURL`                                   | ✅ Done | Insert with `ON CONFLICT (url) DO NOTHING`                                                                                                    |
| `db.MarkURLDone`                               | ✅ Done | Sets `status=done`, `last_crawled_at=NOW()`                                                                                                   |
| `db.MarkURLFailed`                             | ✅ Done | Sets `status=failed`, increments `error_count`                                                                                                |
| `db.GetPendingURLs`                            | ✅ Done | Returns all pending rows ordered by priority                                                                                                  |
| `db.WarmFrontierCache`                         | ✅ Done | Loads pending URLs into their per-source Redis queue on startup                                                                               |
| `db.PushURL(ctx, source, url, priority)`       | ✅ Done | `ZADD frontier:<source> <priority> <url>` — per-source key, not one shared queue (see below)                                                  |
| `db.PopURL(ctx, source)`                       | ✅ Done | `ZPOPMIN frontier:<source>` — returns the next URL for that specific source                                                                   |
| `db.HasAnyURLs`                                | ✅ Done | Any row, any status — used to gate seeding so it only ever runs once (see below)                                                              |
| `db.RequeueStuckInProgress`                    | ✅ Done | Resets `in_progress` → `pending` on startup — recovers work orphaned by a killed/crashed process                                              |
| `db.CountPendingBySource`                      | ✅ Done | Used to detect when a source has run dry and needs more work discovered                                                                       |
| `db.GetDiscoveryCursor` / `SetDiscoveryCursor` | ✅ Done | Redis-backed continuation token per source, so title discovery (e.g. Wikiquote's `allpages`) resumes instead of restarting from the beginning |

### Per-source queues, not one shared priority queue — a real bug, found live

Frontier state used to be one shared Redis sorted set (`frontier`) across all sources, with `scoring.CalculatePriority` giving each source a different base score so `ZPOPMIN` would naturally prefer the "healthier" source. **This works only as long as no source builds up a real backlog.** Confirmed live, and it's the reason the design changed: once Wikiquote's title discovery (below) gave it hundreds of pending pages, Goodreads' single pending page sat **completely unserved** — 476 Wikiquote pending vs. Goodreads' 1, for as long as the process ran — because Wikiquote's base score was always numerically lower, so `ZPOPMIN` picked a Wikiquote URL first every single time, regardless of how many were queued.

Fixed by giving each source its own Redis key (`frontier:<source>`) and its own dedicated worker goroutine (`Crawler.runWorker` in `crawler.go`, one per source, launched from `Run()`) instead of one shared loop picking whichever source's turn it was. Priority (`scoring.CalculatePriority`) only orders URLs _within_ a single source's own queue (e.g. by depth) — it has no say in cross-source scheduling at all, which is what actually guarantees every source keeps progressing regardless of how deep another's backlog gets. Verified live after the original round-robin fix: Goodreads advanced two full pages on its own ~20s cadence, cleanly interleaved with Wikiquote fetches every ~6-7s. German Wikiquote (`wikiquote-de`) joined the same setup once added — a third source is just another goroutine launched from `Run()` with its own cooldown and top-up function, nothing else about the mechanism changes. (This started as single-threaded round-robin across a shared loop, then became one goroutine per source once single-threading itself turned out to be the next real bottleneck — see "Concurrent per-source workers" below.)

### Priority Scoring (`internal/scoring`)

Lower score = crawled sooner **within that source's own queue** — it no longer has any cross-source effect (see above).

```
score = source_base + (depth × DepthPenalty) + (error_count × ErrorPenalty)
```

| Constant            | Value  | Notes                                |
| ------------------- | ------ | ------------------------------------ |
| `DepthPenalty`      | 0.5    | Small nudge per page level           |
| `ErrorPenalty`      | 3.0    | Significant penalty per past failure |
| `DefaultSourceBase` | 1000.0 | Unknown sources go last              |

| Source                      | Base Score |
| --------------------------- | ---------- |
| `scoring.SourceWikiquote`   | 2.0        |
| `scoring.SourceWikiquoteDE` | 2.0        |
| `scoring.SourceGoodreads`   | 10.0       |

### Redis primitives used

| Structure                 | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `Sorted Set` — `frontier` | Priority queue (`ZADD` to push, `ZPOPMIN` to pull) |
| `Set` — `simhash:band:*`  | Near-duplicate quote detection via LSH             |

> **Note:** Visited URL dedup is handled by the `url_frontier` table itself via `UNIQUE` on `url` + `ON CONFLICT DO NOTHING`. No separate visited set needed.

### Politeness / per-source rate limiting (`crawler.go`)

Each source's worker goroutine enforces its own minimum delay between two of its own fetches, **per-source, not one flat number** (`minSourceDelayBySource`) — Goodreads gets 20s, both Wikiquote editions get 6s, because they've earned different levels of caution: a 20-request no-delay burst against Wikiquote (during source research) got a flat `429` after ~11 requests but has otherwise been fine at any pace tested, while Goodreads soft-throttles regardless of pacing. Pooling every source under one delay would either be too lax for Goodreads or needlessly slow for Wikiquote. German Wikiquote reuses English Wikiquote's 6s cooldown outright rather than being separately tuned — same MediaWiki software, no throttling behavior observed yet that would justify treating it differently.

This is a plain local `lastFetch time.Time` inside `Crawler.runWorker`'s loop, not a shared map — since each source now has its own dedicated goroutine, there's nothing else touching that variable to synchronize against. A source waiting out its cooldown just sleeps; it doesn't block any other source's worker, which is exactly what fixed the "waiting too long between fetches" feeling that motivated this (see "Concurrent per-source workers" below) — previously the entire process was one shared loop, so even with per-source cooldowns and round-robin, a source on cooldown still had to wait for whichever source got served that turn to finish its fetch first.

**Adaptive backoff — a source backs itself off when it seems rate-limited.** A slow fetch (`slowFetchWarn`, >10s — Goodreads' tarpit signature) or an outright fetch error (including a Wikiquote `429`, which surfaces as `fetcher.Fetch` returning a `*fetcher.StatusError{StatusCode: 429}`) makes `processURL` return `stalled=true`; the calling worker then advances its own `lastFetch` so the next cooldown check yields `stallPenalty` (60s, matching Goodreads' own observed stall duration) instead of the normal per-source delay. Purely local to that source's own goroutine — it no longer needs to "switch to" another source's queue, since that other source was never blocked in the first place.

**Bounded pacing experiment for Wikiquote (`wikiquoteExperimentalDelay`, currently 4s).** Requested explicitly, with the tradeoff understood: both Wikiquote editions now start at a narrower delay than the proven-safe 6s entry in `minSourceDelayBySource`, chosen from the two data points actually in evidence (6s: proven safe over hundreds of fetches; ~2-3s: confirmed unsafe, the exact pace that produced a live 429 from Wikiquote's discovery API) rather than a third proven-safe number — 4s is a considered guess between them, not a new fact. `fetcher.StatusError` and `fetcher.IsRateLimited(err)` (checking specifically for a 429, not any failure) let `processURL`/`topUpWikiquoteSiteIfEmpty` report a `rateLimited` signal up to `Crawler.runWorker`; the moment either Wikiquote worker actually observes one at this pace, `Crawler.abandonExperimentalPace` permanently widens that worker's `minDelay` back to the safe 6s for the rest of the run — automatically, not something a human needs to be watching logs to catch. Goodreads is unaffected; it never runs at an experimental pace.

### Concurrent per-source workers

Originally the crawl loop was one shared loop, round-robining across sources (`Crawler.popNextReady`) so no single source could starve another — a real fix for a real bug (see "Per-source queues" above), but it left a different problem: the loop was still single-threaded, so a slow or stalled fetch on one source (Goodreads' ~60s tarpit is the concrete example) blocked _every_ source's progress until it returned, even a different source's URL that was already off cooldown and ready to go. Round-robin, per-source cooldowns, and adaptive backoff all only act _between_ fetches — none of them can help once a fetch is already in flight.

Fixed by giving each source in `sourceOrder`'s old place — Goodreads, English Wikiquote, German Wikiquote — its own dedicated goroutine (`Crawler.runWorker`, launched once per source from `Run()`), each running its own independent loop: wait out its own cooldown, pop from its own Redis queue, fetch, parse, save, mark done, repeat. `db.Store`'s underlying `pgxpool.Pool` and `redis.Client` are both already safe for concurrent use by design, so the three goroutines need no additional locking between them — they only ever share the store, and nothing else. Cooldown (`lastFetch`) and, for the two Wikiquote editions, the dead-streak circuit breaker are both plain local variables inside each worker's closure now, not shared maps — since exactly one goroutine ever touches either, there's nothing to synchronize.

Verified with `go test -race ./...` (clean) plus a full rebuild; not yet measured against a live run for actual throughput gain — see handoff.md.

**Discovery calls need the same cooldown as page fetches — found live.** `Crawler.runWorker`'s per-source cooldown only updated around an actual page fetch; the `topUp` branch (Wikiquote's MediaWiki API discovery calls) never touched it at all, so consecutive discovery calls (e.g. walking through several already-fully-known categories in a row) were only ~`idlePollInterval` (2s) apart instead of the real per-source delay (6s) — and hit a genuine `429` from Wikiquote's API as a direct result. Fixed by having each top-up function return a `topUpResult{added, calledNetwork, networkFailed}` instead of a bare `bool`: `runWorker` now updates its cooldown after any top-up call that made a real network request (`calledNetwork`), applying the same `stallPenalty` on failure as a page fetch would. Goodreads' top-up never sets `calledNetwork` — it only seeds a tag URL into Postgres/Redis, no request to goodreads.com happens during top-up itself — so it's unaffected.

### Asynq weighted queues (superseded)

An Asynq-based weighted-queue design was considered here as the fix for "a stalled fetch blocking other sources," before concurrent per-source goroutines (above) solved the same problem more directly, using only what the codebase already had (no new dependency, no separate worker/queue abstraction layer). Not revisited unless a reason to introduce a real task queue shows up independently (e.g. wanting workers on separate processes/machines, not just separate goroutines in one process).

### Recursive subcategory discovery

The curated category list (23 for English, 6 for German) is finite, and confirmed live to actually run out: English Wikiquote's worker went fully idle (0 pending, every curated category's direct members already known) after ~1,572 pages, while Goodreads and German Wikiquote kept progressing fine on their own goroutines — the concurrent-worker fix meant this wasn't a whole-crawler stall, but it was still one source sitting completely idle with real undiscovered content still out there.

Checked live before building anything: `Category:Writers`, despite being fully mined at the top level, has real, on-topic subcategories the flat list never visited — `Category:Writers by language`, `Category:Gay writers`, `Category:Legal writers`, etc. — and those subcategories have further subcategories of their own (`Writers by language` → `Bengali writers`, `Japanese-language writers`, `Urdu-language writers`, ...). This is a genuinely large additional space, not a marginal one.

`Crawler.topUpWikiquoteSiteIfEmpty` now walks it: `fetchWikiquoteCategoryMembers` requests `cmtype=page|subcat&cmprop=title|type` — confirmed live that MediaWiki returns a category's own member pages _and_ its direct subcategories together in a single call, tagged by an explicit `type` field, rather than needing two separate requests. Newly found subcategories are queued (breadth-first, so one path doesn't spiral arbitrarily deep before siblings get a turn) and tracked in a visited set scoped to the current top-level branch, guarding against a cyclic or diamond-shaped category graph. Once a category's own pagination (`cmContinue`) is exhausted, the cursor descends into the next queued subcategory; only once a whole branch — the top-level category and everything under it — has nothing left queued does it advance to the next curated category.

State (`CategoryIndex`, `Current`, `CMContinue`, `Queue`, `Visited`) is packed into the same `wikiquoteDiscoveryCursor` JSON string already persisted per-edition in Redis — no schema change. Each top-up call still makes exactly one HTTP request and is reported back to `runWorker` as one `topUpResult` — deliberately kept 1:1 so the per-source cooldown fix above (each top-up call consumes exactly one cooldown slot) still holds. Combining pages+subcats into one call is a pure efficiency win on top of that, not a relaxation of it: it means a category needs _half_ as many round-trips to fully resolve (one call instead of two), at the same pace as before, rather than resolving at a faster pace.

Also removed a redundant `idlePollInterval` sleep that used to run _in addition to_ the per-source cooldown after every discovery call — found live to be pure waste (the cooldown wait alone already paces the next attempt correctly), and it was making a chain of already-known categories feel needlessly slow to page through. Deliberately did **not** shorten the per-source discovery cooldown itself below the proven-safe 6s: the live 429 that motivated the original cooldown fix happened at almost exactly a 2-3s pace, so that's the one interval directly confirmed unsafe, not merely untested.

Verified live (isolated probes against the real API, not assumed): `Category:Writers` → 68 pages + 6 real subcategories in one call; one of those (`Writers by language`, a pure container with 0 direct pages) → 5 further real subcategories (`Bengali writers`, `Japanese-language writers`, etc.) — confirming both that the combined-call approach works end-to-end through the actual Go code, and that the recursion reaches genuine additional content multiple levels deep.

### Random-page fallback

Even the recursive category walk can genuinely dry up _for a while_ — confirmed live, not hypothetical: German Wikiquote's queue emptied out (0 pending) while its cursor was deep inside a large `Wissenschaftler` (scientist) subcategory branch, most of whose ~50 sub-subcategories (physicist, chemist, biologist, ...) were already fully known. Every top-level curated category eventually funnels into this same situation once its subtree is mostly mined.

`Crawler.wikiquoteTopUpFunc` wraps the normal category-walk top-up with a per-edition `emptyStreak` counter (local to the closure set up once per Wikiquote goroutine in `Run()`, not shared state): after `wikiquoteEmptyStreakBeforeRandom` (10) consecutive top-up calls in a row genuinely add nothing new — a network error doesn't count, only a _successful_ call that still found nothing — it falls back to `Crawler.topUpWikiquoteRandomPages`, which calls MediaWiki's `action=query&list=random&rnnamespace=0` for a batch of genuinely random article titles instead. `rnnamespace=0` keeps it to the main article namespace (excludes `Category:`/`Talk:`/`User:`/etc.), but confirmed live it still returns plenty of non-biographical content (topic pages, dates, TV show pages, even the occasional user-babel subpage) since it draws from the _entire_ wiki rather than curated occupation categories — an accepted tradeoff specific to this being a dead-end escape hatch, not the primary mechanism: the existing per-quote filters and the parser itself (no "Quotes" heading → 0 quotes) already handle a low-yield random page harmlessly, and "sometimes fetches a page with nothing on it" beats "sits idle with nothing to try at all." Doesn't touch the category-walk cursor — it's a one-off injection of extra URLs on top, not a replacement; normal category discovery resumes exactly where it left off on the next call.

Checked whether Goodreads needed the same treatment before building anything for it: live pending counts showed Goodreads sitting at a steady 1 pending (its normal sequential-pagination steady state, not distress) while German Wikiquote was genuinely at 0 — no evidence Goodreads' own tag-cycling fallback is anywhere near its 19-tag limit, so nothing was added there. Goodreads has no MediaWiki-style random-page endpoint to leverage anyway (it's not a wiki); if its tag list ever does prove too small, the natural extension would be more curated tags or the sitemap-based discovery already noted as a future option, not a random-page equivalent.

### Citation-link discovery (`internal/parser/wikilink.go`)

Investigated live after a report that discovery within a parsed page "felt broken": on `de.wikiquote.org/wiki/Führer` (a thematic, not biographical, page), the visible on-page links — "Existenz," "Arbeit," "Demokratie" — are topical cross-references embedded in the quote's own body text, not people. Following those blindly would reintroduce exactly the problem an earlier discovery approach at this project already hit once and abandoned (blind `allpages` enumeration pulling in massive non-biographical junk at whole-site scale) — confirmed this is still true today, not just historical.

The real, precise signal on that same page is different: each quote's _citation_ (e.g. "... - Volker Rühe, Konkret, Heft 2/1998") links the actual person being quoted. `resolveWikiquoteLink` (`internal/parser/wikilink.go`) implements exactly that narrower rule — only links found within a quote's citation are queued, never links found in the quote body itself:

- Rejects anything not starting with `/wiki/` (an interwiki citation link out to `en.wikipedia.org`, seen live with `class="extiw"`, is already a full absolute URL and gets excluded by this alone).
- Rejects known non-content namespaces (`Category:`/`Kategorie:`, `Special:`/`Spezial:`, `Talk:`/`Diskussion:`, `User:`/`Benutzer:`, `File:`/`Datei:`, `Template:`/`Vorlage:`, `Help:`/`Hilfe:`, `Wikiquote:`, `Portal:`) — both languages' prefixes checked regardless of edition, since a wrong-language namespace name never legitimately collides with a real article title.
- Strips a URL fragment (`/wiki/Aristotle#Politics` → `/wiki/Aristotle`) rather than rejecting it — same page, already worth queueing.

Wired into both Wikiquote parsers (`wikiquotes.go`, `germanwikiquote.go`), each extracting citation links from their own structurally different citation shape (English: a nested `<ul><li>`; German: inline `<dl>/<ul>` sourcing plus a trailing `<i>`, dash-separated in the same `<li>`) before stripping that citation markup out of the quote text as before. Confirmed live on a second, independent page (an English "Leadership" thematic page) that the same distinction holds there too. `dedupeStrings` (also in `wikilink.go`) keeps a page's `NextURLs` from repeating the same cited author once per quote that cites them.

This supplements, not replaces, the MediaWiki category-based discovery above — category discovery remains the primary, high-volume mechanism; citation links add a secondary trickle of on-topic pages a curated category list might not otherwise reach.

**A real Goodreads parser bug, found only by testing what this feature would actually produce**: extending the same idea to Goodreads (each quote's author avatar link, `a.quoteAvatar`) surfaced that the avatar's `href` is an author's _profile_ page (`/author/show/ID.Name`), not the _quotes_ page (`/author/quotes/ID.Name`) this parser's own selectors are built to handle — confirmed live that `/author/show/` doesn't even render a matching quote card. Fixed by rewriting the href via `goodreadsAuthorShowLink` to the `/author/quotes/` equivalent (the `ID.Name` suffix carries over unchanged) before queueing. That same live check also surfaced an unrelated, pre-existing latent bug: the quote-card selector required both classes `quote` and `mediumText` (`div.quote.mediumText`), but an author's quotes page renders the card as `<div class='quote'>` alone — no `mediumText` — so this parser would have silently extracted zero quotes from every single author page once they started being discovered. Fixed by broadening the selector to `div.quote` (confirmed live via grep on both real fetched page types that no other page element uses the bare class `quote`).

### Localized Wikiquote editions (`internal/parser/wikiquote_i18n.go`)

French, Spanish, Italian, Portuguese, Polish, Swedish, Romanian, Czech, Hungarian, Danish, Norwegian (Bokmål), and Finnish were added the same way German was: same generalized `wikiquoteSite` discovery mechanism, category namespace prefix and at least one curated category's real membership confirmed live via each edition's own MediaWiki API before being added (Italian's edition is the largest of the fourteen by article count — bigger than German's). Non-Latin-script editions (Russian, Ukrainian, etc.) were deliberately skipped — `dedup.IsLatinScript` would reject their content outright, a bigger design change than adding another Latin-script edition. **Dutch was checked and rejected**: confirmed live (two separate pages) that Dutch Wikiquote gives quotes in their _original_ language (German/English/etc.) with Dutch-only editorial labels around them ("Origineel in het Duits:", "Bron:", "Aanhaling(en):") rather than a Dutch translation — a genuinely different extraction problem (identify and extract only the Dutch-original entries, skip the rest), not worth building separately for a 1,317-article edition.

Rather than one parser file per language, one `LocalizedWikiquoteParser` (parameterized by source, language, and a per-edition excluded-heading-prefix list) covers all twelve — confirmed live on each edition's own Einstein/Gandhi page that none of them use English's "one fixed heading literally named Quotes" layout (French/Spanish nest real quotes a level deeper, under h3 sections inside a top "Citations"/"Citas" bucket; Italian splits them across several top-level sections, one per cited work; Portuguese/Swedish/Romanian/Czech/Hungarian/Norwegian/Finnish have no bucket at all, just plain thematic or single-bucket top-level sections; Danish's real quotes sit directly under the article intro with _no heading at all_ before them) — the same "every heading is quote-bearing except a known exclusion list" model German already uses, generalizes cleanly to all of them. `inQuotesSection` starts `true`, not `false` — real bug found live on Danish (a page with no heading before its real quotes returned 0 under the old default); starting included-by-default matches the exclusion-list philosophy itself rather than being a per-language special case, and was re-verified live across every edition afterward to confirm it introduces no new false-positive noise.

That generalization needed one refinement beyond German's own: heading exclusion has to be **inherited by nesting level**, not just checked heading-by-heading. Real bug found live on French: the "Œuvres choisies" (Selected Works) h3 is correctly excluded by name (it's a bibliography list, not quotes), but its own h4 sub-headings — one per book title — aren't themselves in the exclusion list, so evaluating each heading independently flipped inclusion back on the moment one of those sub-headings appeared, leaking bibliography entries as if they were quotes. Fixed by tracking inclusion state per heading level, where a deeper heading can only be included if the heading enclosing it was too.

Deliberately doesn't attempt citation-link `NextURLs` the way English/German do — confirmed live that citation structure varies by edition too (Portuguese/Italian: a citation is a sibling `<dl>` after the `<ul>`, never inside the `<li>` at all; Polish: a nested `<ul>` inside the `<li>`, English-shaped; Spanish: a numbered footnote `<sup>` pointing at a References section; French: an inline `<div class="ref">`, sometimes as the _entire_ content of its own `<li>` sibling with no quote text at all — skipped outright rather than saved as a fake quote). Chasing five more citation shapes risked repeating the exact contamination bug already found and fixed on German (see "Citation-link discovery" above) for comparatively little payoff; these editions are self-sustaining via the same MediaWiki category discovery as English/German instead. A nested `<ul>`/`<dl>`/footnote `<sup>` found _inside_ a `<li>` is still stripped before saving either way, purely so it can't contaminate the quote text.

**Known, accepted per-article noise, not chased further**: French in particular has structural quirks beyond the bibliography bug above (a "citation of the day" caption like "Citation choisie pour le 12 octobre 2011.", cross-language variant labels like "(en)"/"(de)" prefixing an original-language quote) that slip through as low-quality but not corpus-corrupting entries — the same class of tradeoff already accepted for German's own citation-fragment leakage (see "German Wikiquote" parser note above). Not worth chasing further right now; the per-quote quality filters (`IsTooShort`, `LooksLikeDictionaryEntry`, `MatchesClaimedLanguage`) provide a second layer of defense regardless of source-specific quirks.

### Three real cross-parser bugs found auditing "are we silently missing content"

Prompted directly by a live report that `en.wikiquote.org/wiki/Fyodor_Dostoyevsky` returned 0 quotes and 0 discovered URLs. Investigated and fixed, then generalized the audit to every Wikiquote parser (`wikiquotes.go`, `germanwikiquote.go`, `wikiquote_i18n.go`) rather than patching Dostoyevsky alone:

1. **`WikiquoteParser` required an _exact_ `"Quotes"` heading match.** Confirmed live: Dostoyevsky's real heading is "General", not "Quotes" — a legitimate Wikiquote convention, not a malformed page. Switched to the same exclusion-list model (`englishWikiquoteExcludedHeadingPrefixes`) already proven on German and the localized editions.
2. **A semi-protected page renders a second, empty `div.mw-parser-output`.** MediaWiki's "this page is protected" padlock indicator is rendered through the same wikitext pipeline, producing its own tiny `mw-parser-output` div _earlier_ in the DOM (inside `mw-indicators`) than the real content one. Every parser's unscoped `doc.Find("div.mw-parser-output").First()` silently grabbed that empty decoy instead — confirmed live on `Charles_Darwin` (semi-protected): 0 quotes despite having a perfectly correct `"Quotes"` heading. Fixed by scoping to `#mw-content-text div.mw-parser-output` everywhere. This also retroactively explains an earlier session's README note that Shakespeare/Buddha/Darwin "yield 0 quotes, a real per-article limitation" — that was never a per-article limitation, it was bugs #1 and #2 (Shakespeare's real heading is "William_Shakespeare_Quotes"; Buddha's page has no "Quotes" heading at all, just topical sections; Darwin is semi-protected). Verified live after both fixes: Shakespeare 0→62, Buddha 0→85, Darwin 0→89 quotes.
3. **Numbered `<ol>` lists were silently skipped** — every parser only matched `s.Is("ul")`. Confirmed live on Buddha's page (a numbered list of "his last sermon"'s eight main points, structurally a sibling `<ol>` after an intro `<ul><li>`). Extended to `s.Is("ul, ol")` everywhere; `<li>` extraction itself needed no change since both list types use the same child tag.

Also checked, found to be a non-issue: Goodreads' avatar-link selector (`a.quoteAvatar`) has a documented alternate class (`a.leftAlignedImage`) that looked unhandled — confirmed live the two classes always co-occur on the same `<a>` element in practice, so no fix was needed there.

## TODO

### Phase 1 — Foundations

- ✅ Move crawler loop from `main.go` → `internal/crawler/crawler.go`
- ✅ Add rate limiting (per-source delay, in `crawler.go`'s dispatch loop rather than `fetcher.go` itself — see "Politeness / per-source rate limiting" above). Previously checked off here without actually being implemented — verified and fixed, not just re-marked.
- ✅ Write tests for `dedup`, `parser`, `db`
- ✅ Dynamic next-page detection in toscrape parser (kept for a real live-fetch integration test; toscrape itself is still not a crawl target)
- ✅ English-only quote filter (`dedup.IsLatinScript`) — Wikiquote author pages often contain the original non-English text (Confucius in Chinese, Aristotle in Ancient Greek, etc.) alongside an English translation; non-Latin-script quotes are logged and skipped before saving. Ratio-based (≤10% non-Latin letters tolerated), not an any-single-letter reject — a real Plato quote had one stray Greek "Η" homoglyph in an otherwise fully English 300+ letter quote, which an any-letter check wrongly rejected.
- ✅ Real language verification, not just script verification (`dedup.MatchesClaimedLanguage`, `internal/dedup/language.go`) — `IsLatinScript` only ever caught non-Latin _scripts_ (Arabic, Cyrillic, CJK); it structurally cannot catch a quote in French, Portuguese, Latin, Romanian, Italian, Spanish, Turkish, Indonesian, Tagalog, or German-tagged-as-English, since all of those use the Latin alphabet too. Found live via a full-corpus audit: 609 of 54,805 checked quotes (1.11%) were genuinely written in a different language than their `language` tag claimed — real authors (Camus, Cicero, Goethe, Schopenhauer, Kierkegaard, Elif Şafak, Cioran, among many others) whose Wikiquote/Goodreads pages mixed in a non-English (or non-German) passage that the crawler saved anyway. Uses [`lingua-go`](https://github.com/pemistahl/lingua-go), a real statistical language detector (n-gram based), rather than a hand-rolled heuristic — this class of problem (which of dozens of plausible languages is this Latin-script text actually in) isn't something a few regexes generalize to safely. Built from `FromAllLanguagesWithLatinScript()`, not every language the library knows — `MatchesClaimedLanguage` only ever runs on text that's already passed `IsLatinScript`, so loading Arabic/Cyrillic/CJK/Devanagari/etc. models would be pure waste; restricting to Latin-script languages cut the detector's memory footprint from ~1GB to ~330MB with zero accuracy change on every known regression case (confirmed live before switching, not assumed — see `PRODUCTION.md` for the fuller memory story). Skips the check below `minLengthForLanguageCheck` (30 runes) — confirmed live that short, genuine quotes ("War is war.", "Excelsior!") score too low/noisily to trust statistically at that length, the same problem `MinQuoteLength` already exists for; requires `languageConfidenceThreshold` (0.025, recalibrated once already after a full-corpus audit surfaced one real false positive at the initial 0.05) confidence in the claimed language, calibrated from the real gap between confirmed leaks (max 0.0196) and that one false positive (0.0415). The detector's model loading (~1.2s, one-time) is warmed explicitly at crawler startup (`Crawler.Run`), not left to surprise the first quote processed. Applies going forward only — the 631 already-flagged rows were deleted in a one-off cleanup at the user's request (see handoff.md).
- ✅ Game-fit quote filters (`dedup.IsTooShort`, `dedup.LooksLikeDictionaryEntry`, applied in `crawler.go` right alongside the Latin-script filter) — content-quality gates found live: (1) quotes under 8 characters were consistently citation/page-reference fragments that leaked through as standalone "quotes" (`"Ch.8"`, `"p. 280"`, a bare `"[7]"` footnote marker) — `IsTooShort` rejects anything under `MinQuoteLength` (8 runes), a floor confirmed against the corpus to sit exactly between the shortest real quote found (`"Be brave"`, 8 chars) and the longest junk fragment found (`"p. 376."`, 7 chars). (2) Ambrose Bierce's German Wikiquote page contains real, correctly-attributed quotes from his _Devil's Dictionary_ — genuine content, but shaped like reference-book entries ("Zukunft, die [Subst.], jene Zeit...") rather than something quotable in a game; `LooksLikeDictionaryEntry` rejects that specific shape (headword + bracketed part-of-speech abbreviation near the start) via a regex deliberately narrow enough to not also reject the 1,244 other quotes in the corpus that legitimately use brackets for scholarly editorial insertions (e.g. "[T]he ancient philosophers..."). Both apply going forward only — existing rows already in the DB were left as-is.
- ✅ **Superseded**: an upper length reject (`IsTooLong`/`MaxQuoteLength`, 500 runes) briefly existed here too, for the same reason — some Goodreads pages save a full speech/essay as a single "quote" (real outliers found: 4,000-5,300 characters vs. a corpus average of 275), a poor fit for a typing race specifically. Removed at the user's explicit request: rejecting long quotes at ingest throws away real content that some _other_ future consumer of this corpus might want, when the actual constraint ("too long for this one typing-race game") only makes sense at the point where a specific game is asking for a quote — which `backend/api`'s `minWords`/`maxWords` query params already handle precisely. The crawler now saves quotes of any length; `MinQuoteLength`/`IsTooShort` stays, since a citation fragment isn't valid content for _any_ consumer, not just this one game.

### Phase 2 — URL Frontier

- ✅ Goose migration for `url_frontier` table (with `crawl_status` enum)
- ✅ `db.SaveURL` / `db.MarkURLDone` / `db.MarkURLFailed` storage functions
- ✅ `db.GetPendingURLs` — query pending URLs ordered by priority
- ✅ `db.WarmFrontierCache` — load pending URLs from Postgres into Redis on startup
- ✅ `db.PushURL` / `db.PopURL` — ZADD / ZPOPMIN wrappers
- ✅ `scoring.CalculatePriority` — URL scoring function
- ✅ Seed URLs inserted into frontier on first run — genuinely once, not "until the batch finishes." The original guard checked `GetPendingURLs` for emptiness, which goes empty again the moment a seed batch completes — re-triggering seeding (and re-crawling already-done pages) on the next restart. Caught live: a Wikiquote seed page got re-fetched a 2nd/3rd time. Fixed with `db.HasAnyURLs` (any row, any status).
- ✅ Wire frontier into `crawler.go`
- ✅ Crash recovery for orphaned `in_progress` rows — a killed/crashed process leaves whatever URL it was mid-fetch on stuck at `in_progress` forever (already popped from Redis, never requeued). `db.RequeueStuckInProgress` resets these to `pending` on every startup, before `WarmFrontierCache` picks them back up. Caught live: a `timeout`-killed test run left 3 rows stranded.

### Phase 3 — New Sources

This project runs on two sources only — everything else considered was cut for cause (Cloudflare wall + explicit `robots.txt` block, dead DNS, etc.) or just isn't worth building next to Goodreads' scale. See git history if the earlier candidates' details are ever needed again.

- ✅ Goodreads parser (`internal/parser/goodreads.go`) — quotes + author + tags + pagination and per-author-avatar `NextURLs`, verified against a live fetch. Wired as the seeded starting source in `crawler.SeedFrontier`. Soft-throttled under sustained crawling — see caveat below.
- ✅ Wikiquote parser (`internal/parser/wikiquotes.go`) — quotes + author from a page's "Quotes" section, verified against multiple live fetches. Some pages yield 0 quotes (e.g. Shakespeare, Buddha, Darwin as tested) — those articles structure quotes differently (by play/work headings rather than a single "Quotes" section), a real per-article limitation, not a bug to chase down right now.
- ✅ Wikiquote title discovery (`internal/crawler/wikiquote_discovery.go`) — real MediaWiki title enumeration, not just the fixed ~20-author stopgap list. `Crawler.topUpWikiquoteSiteIfEmpty` checks a Wikiquote edition's pending count whenever nothing is ready to crawl and fetches the next batch (500, the anonymous-access max) if it's run dry, tracking a continuation cursor in Redis (`db.GetDiscoveryCursor`/`SetDiscoveryCursor`, keyed per edition) so it resumes rather than re-fetching the same titles. **Category-based, not blind alphabetical `allpages` enumeration** (the original approach) — `allpages` pulls in every article on the site regardless of topic, and confirmed live that most yield "0 quotes, 0 discovered URLs" (movies, TV shows, books, historical events have no "Quotes" heading). Switched to walking a curated list of Wikiquote's own occupation categories (23 for English, 6 for German, each confirmed live to have real members before being added) via `action=query&list=categorymembers`, which meaningfully biases discovery toward pages that are actually about a quotable person. Once every category is fully walked, the cursor wraps back to the first one — cheap (`ON CONFLICT DO NOTHING` skips anything already known) and eventually productive again as Wikiquote gains new articles over time.
- ✅ Goodreads dead-end fallback (`Crawler.topUpGoodreadsIfEmpty`, `goodreadsTags`) — the single seeded tag (`inspirational`) has finite pagination and will eventually exhaust. If nothing is ready anywhere and both Wikiquote editions' current categories are also genuinely exhausted (not just cooling down), this seeds the next tag from a curated list (`life`, `love`, `wisdom`, `happiness`, etc. — confirmed live to exist during source research) instead of the crawler just idling forever with real discoverable content still available.
- ✅ German Wikiquote (`internal/parser/germanwikiquote.go`, `wikiquoteDE` in `internal/crawler/wikiquote_discovery.go`) — a second, genuinely German-language quote source rather than just a translated English one. Discovery reuses the same MediaWiki `categorymembers` mechanism as English Wikiquote via a generalized `wikiquoteSite` struct (host, category namespace prefix — `Kategorie:` not `Category:` — curated category list), so the fairness/round-robin/dead-streak machinery above needed no changes to accommodate a third source. The page structure itself differs enough from English Wikiquote to need its own parser: German biography pages don't consistently use one fixed heading name for the real quotes section (verified live across several pages — sometimes the article's own name heading directly contains the quotes, e.g. Goethe; sometimes a second heading like "Überprüft" or "Zitate mit Quellenangabe" does instead, e.g. Twain, Einstein), so every top-level section is treated as quote-bearing except a known exclusion list (`Fälschlich zugeschrieben`, `Zitate mit Bezug auf …`, `Weblinks`, etc.) rather than matching one exact heading name. Citations are also inline in the same `<li>` (dash-separated) rather than in a separate nested `<ul>` like English Wikiquote, which occasionally leaks a citation fragment into the quote text on more complex citation formats — a known, accepted imperfection (most quotes extract cleanly; verified against captured Twain/Goethe/Einstein pages). No German stopgap author seed list — bootstraps entirely from category discovery the first time the crawler goes idle, same as Goodreads' tag fallback.
- ✅ `language` column on `quotes` (migration `20260913200000_add_quotes_language.sql`) — every parser now tags what language a quote's text is actually in (`en` for Goodreads/English Wikiquote/toscrape, `de` for German Wikiquote) rather than assuming everything is English. Defaults to `en` in `db.SaveQuote` for backward compatibility with rows/parsers that predate this field.
- [ ] CSV importer for Kaggle dataset

> **Goodreads throttles sustained sequential crawling — engineer around it, don't treat it as "fully open."** Confirmed by direct testing: ~35 sequential pagination requests against one tag (`?page=2..45`), spaced anywhere from 0.3s to 2.5s apart, hit an artificial **~60-second stall roughly every 10–13 requests** (observed at request #14, #27, and #40 — a gap of 13 each time, independent of pacing) while still returning a normal `200` with valid quote content — no error, no CAPTCHA, nothing a naive monitor would flag as a failure. This looks like deliberate per-IP tarpitting rather than network noise (same site, same tag, isolated single requests — a plain re-fetch of the "slow" URL afterward returns in ~1s). `crawler.go` now enforces a per-source minimum delay and logs slow fetches explicitly — see "Politeness / per-source rate limiting" above — but this doesn't eliminate the throttling (it looks count-based, not purely rate-based), only makes the crawler polite about it and visible when it happens.
>
> **Wikiquote pages don't have "next page" links, but the MediaWiki API can still enumerate them.** Unlike Goodreads' pagination links, most of a Wikiquote author page's outgoing links are unrelated topical wikilinks embedded in the quote body, not "more quote pages" — so `WikiquoteParser.Parse`/`GermanWikiquoteParser.Parse` deliberately don't follow those. The primary discovery mechanism remains a separate side channel (`fetchWikiquoteCategoryMembers`, `action=query&list=categorymembers`), triggered by the crawl loop itself rather than by anything found on a fetched page — see "Wikiquote title discovery" above. It now recurses into subcategories once a category's own direct members run dry, rather than stopping at one level — see "Recursive subcategory discovery" below. Both parsers do now return a narrow, secondary set of `NextURLs` sourced only from each quote's own citation link — see "Citation-link discovery" below.

### Phase 4 — Workers & Infrastructure

- ✅ Fetcher workers consuming from Redis frontier — one goroutine per source (`Crawler.runWorker`), the real fix for "a stalled fetch blocks the whole loop." See "Concurrent per-source workers" above.
- [ ] Asynq workers with weighted queues (critical / default / low) — superseded by the goroutine-per-source approach above; not revisited unless a real task-queue need (separate processes/machines) shows up independently
- [ ] Per-domain error tracking + automatic backoff
- ✅ Fetch timeout (`internal/fetcher.Fetch`, 90s) — previously unset entirely (would hang forever on a dead connection). 90s is deliberately above Goodreads' observed ~60s stalls so a slow-but-succeeding request isn't misclassified as failed.
- ✅ Backoff on Redis/Postgres errors in the crawl loop (`errorBackoff`, 1s) — the `PopURL`/`GetURLByURL`/`MarkURLInProgress` error paths previously `continue`d with no delay at all, so a persistent outage (Redis restarting, Postgres unreachable) would spin the loop as fast as the CPU allows.
- ✅ Bounded retry on fetch failure (`Crawler.failOrRetry`, `maxURLRetries` = 3, `db.RetryURL`) — previously a single failed fetch (a transient network blip, a momentary 5xx) marked that URL permanently `failed` with no second chance, ever. Now it's requeued to `pending` with an incremented `error_count` and a correspondingly lower priority (reusing `scoring.CalculatePriority`'s existing error-count term) up to `maxURLRetries` attempts before giving up for good. Scoped to fetch failures only — parse failures and an unrecognized source are near-deterministic given the same page content, so retrying wouldn't help.
- ✅ Graceful shutdown (context cancellation) — `main.go` now derives its context from `signal.NotifyContext` (SIGINT/SIGTERM) instead of `context.Background()`; every wait point in `Crawler.runWorker` (`sleepCtx`) and `fetcher.Fetch` itself are context-aware, so a shutdown signal stops each worker within roughly one in-flight fetch instead of waiting out whatever cooldown, stall penalty, or 90s fetch timeout happened to be pending.
- ✅ Startup build-identification log line — logs the checked-out git commit (and whether the working tree is dirty) on startup, so it's always obvious which code a running process is actually on. Deliberately shells out to `git rev-parse`/`git status` rather than using `runtime/debug.ReadBuildInfo`'s automatic VCS stamp: tested live and confirmed `go run` (how this crawler is actually started) does not embed VCS info in this environment, only `go build`/`go install` do — the idiomatic approach would have silently done nothing for the one invocation method that matters.
- [ ] Structured logging (slog or zap)
- [ ] Metrics (crawl rate, save rate, error rate)
