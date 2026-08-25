# quotes-crawler

A scalable web crawler that collects quotes from multiple sources and stores them in PostgreSQL.

## Sources

| Source                                                                    | Method                  | Status                    | Notes                                        |
| ------------------------------------------------------------------------- | ----------------------- | ------------------------- | -------------------------------------------- |
| [quotes.toscrape.com](https://quotes.toscrape.com)                        | Crawler                 | ✅ Done                   | Sandbox site, 100 quotes                     |
| [Quotable API](https://api.quotable.io)                                   | API Fetcher             | ❓ Api at the moment down | 5000+ curated quotes, no auth needed         |
| [BrainyQuote](https://brainyquote.com)                                    | Crawler                 | ⬜ Planned                | 100k+ quotes, clean HTML                     |
| [Wikiquote](https://en.wikiquote.org)                                     | Crawler (MediaWiki API) | ⬜ Planned                | Millions of quotes, needs wikitext parser    |
| [GoodReads](https://goodreads.com/quotes)                                 | Crawler                 | ⬜ Planned                | Millions of quotes, aggressive bot detection |
| [Kaggle Dataset](https://www.kaggle.com/datasets/akmittal/quotes-dataset) | CSV Import              | ⬜ Planned                | 500k+ quotes, bulk seed                      |

## Stack

- **Language:** Go
- **Database:** PostgreSQL
- **Migrations:** Goose
- **HTML Parsing:** goquery
- **Queue:** Redis + Asynq (planned)

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
On startup  → load all pending rows → ZADD into Redis Sorted Set (score = priority)
                ↓
Fetcher workers → ZPOPMIN from Redis → fetch page → mark status=in_progress in DB
                ↓
Parser workers  → extract quotes + discover next-page URLs
                ↓
Quotes      → quotes table
New URLs    → INSERT INTO url_frontier ON CONFLICT DO NOTHING + ZADD Redis
                ↓
Mark URL    → status=done or status=failed (increment error_count)
```

On Redis restart → reload all `status=pending` rows from DB back into Redis (same pattern as `WarmSimhashCache`).

### Storage functions

| Function               | Status  | Notes                                          |
| ---------------------- | ------- | ---------------------------------------------- |
| `db.SaveURL`           | ✅ Done | Insert with `ON CONFLICT (url) DO NOTHING`     |
| `db.MarkURLDone`       | ✅ Done | Sets `status=done`, `last_crawled_at=NOW()`    |
| `db.MarkURLFailed`     | ✅ Done | Sets `status=failed`, increments `error_count` |
| `db.GetPendingURLs`    | ✅ Done | Returns all pending rows ordered by priority   |
| `db.WarmFrontierCache` | ✅ Done | Loads pending URLs into Redis on startup       |
| `db.PushURL`           | ✅ Done | `ZADD frontier <priority> <url>`               |
| `db.PopURL`            | ✅ Done | `ZPOPMIN frontier` — returns next URL to crawl |

### Priority Scoring (`internal/scoring`)

Lower score = crawled sooner:

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
| `scoring.SourceQuotable`    | 1.0        |
| `scoring.SourceBrainyQuote` | 5.0        |
| `scoring.SourceGoodreads`   | 20.0       |

### Redis primitives used

| Structure                 | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `Sorted Set` — `frontier` | Priority queue (`ZADD` to push, `ZPOPMIN` to pull) |
| `Set` — `simhash:band:*`  | Near-duplicate quote detection via LSH             |

> **Note:** Visited URL dedup is handled by the `url_frontier` table itself via `UNIQUE` on `url` + `ON CONFLICT DO NOTHING`. No separate visited set needed.

### Asynq weighted queues (planned)

```
critical (weight 6) → high-yield, reliable sources (Quotable API)
default  (weight 3) → mid-tier sources (BrainyQuote)
low      (weight 1) → slow or unreliable sources (Goodreads)
```

## TODO

### Phase 1 — Foundations

- ✅ Move crawler loop from `main.go` → `internal/crawler/crawler.go`
- ✅ Add rate limiting to `fetcher` (configurable delay per domain)
- ✅ Write tests for `dedup`, `parser`, `db`
- [ ] Dynamic next-page detection in toscrape parser (skipped — toscrape not a target source)

### Phase 2 — URL Frontier

- ✅ Goose migration for `url_frontier` table (with `crawl_status` enum)
- ✅ `db.SaveURL` / `db.MarkURLDone` / `db.MarkURLFailed` storage functions
- ✅ `db.GetPendingURLs` — query pending URLs ordered by priority
- ✅ `db.WarmFrontierCache` — load pending URLs from Postgres into Redis on startup
- ✅ `db.PushURL` / `db.PopURL` — ZADD / ZPOPMIN wrappers
- ✅ `scoring.CalculatePriority` — URL scoring function
- [ ] Seed URLs inserted into frontier on first run
- [ ] Wire frontier into `crawler.go`

### Phase 3 — New Sources

- [ ] Quotable API fetcher + parser (`internal/parser/quotable.go`)
- [ ] BrainyQuote parser (`internal/parser/brainyquote.go`)
- [ ] Wikiquote parser via MediaWiki API (`internal/parser/wikiquote.go`)
- [ ] CSV importer for Kaggle dataset

### Phase 4 — Workers & Infrastructure

- [ ] Fetcher workers consuming from Redis frontier
- [ ] Asynq workers with weighted queues (critical / default / low)
- [ ] Per-domain error tracking + automatic backoff
- [ ] Retry logic in fetcher
- [ ] Graceful shutdown (context cancellation)
- [ ] Structured logging (slog or zap)
- [ ] Metrics (crawl rate, save rate, error rate)
