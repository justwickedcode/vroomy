# Handoff — quotes-crawler

## What we did this session

### New package: `internal/crawler`

- Created `internal/crawler/crawler.go` with:
  - `Crawler` struct holding `*db.Store`
  - `New(store *db.Store) *Crawler` constructor
  - `SeedFrontier(ctx)` — seeds the frontier on first run only
  - `Run(ctx)` — main crawl loop

### `SeedFrontier`

- Checks `GetPendingURLs` first — if non-empty, returns early (idempotent)
- Calculates priority via `scoring.CalculatePriority(source, 0, 0)` before building the struct
- Calls `SaveURL` then `PushURL` for each seed — logs and continues on error
- Current seed: BrainyQuote only (`https://www.brainyquote.com/topics/inspirational-quotes`)
- Quotable API dropped — service is down and likely staying down

### `Run` loop flow

```
WarmSimhashCache
WarmFrontierCache
SeedFrontier
loop:
  PopURL → if empty, sleep 5s and continue
  MarkURLInProgress
  Fetch
  Parse (dispatched by source — switch statement, not yet implemented)
  MarkURLDone or MarkURLFailed
```

### `main.go` slimmed down

- Removed old hardcoded toscrape loop
- Now just: setup (Postgres, Redis, migrations) → `crawler.New(store)` → `crawler.Run(ctx)`

### `MarkURLInProgress` added to `internal/db/store.go`

- Sets `status = 'in_progress'`, no `last_crawled_at` update

---

## Current state

The crawler runs and reaches the crawl loop. It seeds BrainyQuote, pops it, fetches it, then fails because `ToscrapeParser` is the wrong parser. The URL gets marked `failed`, the queue empties, and the loop sleeps. Everything is working as expected — just missing the BrainyQuote parser.

---

## What's next

### 1. Update the `Parser` interface (do this first)

Current interface only returns quotes:

```go
type Parser interface {
    Parse(html string) ([]models.Quote, error)
}
```

Change it to return both quotes and discovered next URLs:

```go
type Result struct {
    Quotes   []models.Quote
    NextURLs []string
}

type Parser interface {
    Parse(html string) (Result, error)
}
```

Then update `ToscrapeParser` to match the new signature (it can return empty `NextURLs` for now since toscrape isn't a real source). Update the call site in `crawler.Run()` too.

### 2. BrainyQuote parser (`internal/parser/brainyquote.go`)

Before writing code:

- Open `https://www.brainyquote.com/topics/inspirational-quotes` in browser
- Right-click a quote → Inspect Element
- Find selectors for:
  - Quote container
  - Quote text
  - Author name
  - Next page link (pagination)

The parser should implement the new `Parser` interface — return both quotes and next-page URLs. For pages that look structurally different (topic page vs author page), handle that inside the parser itself.

### 3. Wire parser dispatch in `Run()`

`PopURL` currently returns only the URL string — but you need the source too to dispatch to the right parser. Two options:

- Do a DB lookup by URL after `PopURL` to get the full `URLFrontier` row (simpler, slight overhead)
- Change `PopURL` to return `(url, priority string, error)` or the full struct (requires storing source in Redis too)

Recommended: DB lookup after `PopURL` for now. Add a `GetURLByURL(ctx, url) (models.URLFrontier, error)` function to `store.go`.

Then in `Run()`:

```go
row, err := c.store.GetURLByURL(ctx, url)
// ...
switch row.Source {
case "brainyquote":
    result, err = (&parser.BrainyQuoteParser{}).Parse(html)
default:
    log.Printf("Unknown source: %s", row.Source)
    _ = c.store.MarkURLFailed(ctx, url)
    continue
}
```

### 4. Push discovered URLs back into frontier

After parsing, loop over `result.NextURLs`:

```go
for _, nextURL := range result.NextURLs {
    priority := scoring.CalculatePriority(row.Source, row.Depth+1, 0)
    frontier := models.URLFrontier{URL: nextURL, Source: row.Source, Priority: priority}
    _, err := c.store.SaveURL(ctx, frontier)
    // log error, continue
    err = c.store.PushURL(ctx, nextURL, priority)
    // log error, continue
}
```

### 5. Save quotes from parse result

Currently `Run()` discards the parse result entirely (`_, err = ...`). Wire in `store.SaveQuote` for each quote in `result.Quotes`.

---

## Key decisions made

- **Parser returns both quotes and next URLs** — one `Parse` method, one `Result` struct, no split interface
- **Source dispatch via switch** — clean, simple, no over-engineering
- **DB lookup for source after PopURL** — Redis only stores URL + priority, source lives in Postgres
- **No Quotable API** — service is permanently down, removed from sources
- **toscrape.com** — sandbox only, keeping parser but not a real crawl target

---

## File structure

```
cmd/
└── crawler/
        main.go              ← setup only, calls crawler.Run()
internal/
├── crawler/
│       crawler.go           ← NEW: Crawler struct, Run(), SeedFrontier()
├── db/
│   │   store.go             ← added MarkURLInProgress
│   └── migrations/
├── parser/
│       parser.go            ← Parser interface — needs update (see above)
│       toscrape.go          ← needs update to new interface
│       brainyquote.go       ← NEXT: to be created
└── scoring/
        scoring.go
```

---

## Goose workflow reminder

```bash
goose create <name> sql
goose up
goose down
goose status
```

Env vars:

```
GOOSE_DRIVER=postgres
GOOSE_DBSTRING=postgres://user:password@localhost:5432/quotes?sslmode=disable
GOOSE_MIGRATION_DIR=./internal/db/migrations
```
