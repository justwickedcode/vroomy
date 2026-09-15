//go:build integration

// Integration tests against the docker-compose Postgres + Redis (not testcontainers).
// Run with: docker compose up -d && go test -tags=integration ./internal/crawler/...
// State persists in the compose volumes across runs by design (dev env).
package crawler_test

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"testing"
	"time"

	"quotes-crawler/internal/db"
	"quotes-crawler/internal/fetcher"
	"quotes-crawler/internal/models"
	"quotes-crawler/internal/parser"
	"quotes-crawler/internal/scoring"

	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

// setupStore returns a Store backed by the live docker-compose Postgres + Redis, plus the raw
// Redis client so tests can verify frontier membership directly (PopURL drains the per-source
// "frontier:<source>" ZSET, which other tests/leftover state also share, so it's the wrong
// tool for "did my push land" assertions).
func setupStore(t *testing.T) (*db.Store, *redis.Client) {
	t.Helper()
	_ = godotenv.Load("../../.env")

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/quotes?sslmode=disable"
	}
	pool, err := db.ConnectPostgres(dbURL)
	if err != nil {
		t.Fatalf("could not connect to postgres (is `docker compose up` running?): %v", err)
	}
	t.Cleanup(pool.Close)

	if err := db.Migrate(pool); err != nil {
		t.Fatalf("could not migrate: %v", err)
	}

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	redisPassword := os.Getenv("REDIS_PASSWORD")
	if redisPassword == "" {
		redisPassword = "redis"
	}
	redisDB := 0
	if v := os.Getenv("REDIS_DB"); v != "" {
		redisDB, _ = strconv.Atoi(v)
	}

	redisClient, err := db.ConnectRedis(redisAddr, redisPassword, redisDB)
	if err != nil {
		t.Fatalf("could not connect to redis (is `docker compose up` running?): %v", err)
	}
	t.Cleanup(func() { _ = redisClient.Close() })

	return db.NewStore(pool, redisClient), redisClient
}

func TestFrontier_PushPopRoundTrip(t *testing.T) {
	store, _ := setupStore(t)
	ctx := context.Background()

	url := fmt.Sprintf("https://example.test/frontier-roundtrip-%d", time.Now().UnixNano())
	priority := scoring.CalculatePriority(scoring.SourceGoodreads, 0, 0)

	if err := store.PushURL(ctx, scoring.SourceGoodreads, url, priority); err != nil {
		t.Fatalf("PushURL failed: %v", err)
	}

	got, err := store.PopURL(ctx, scoring.SourceGoodreads)
	if err != nil {
		t.Fatalf("PopURL failed: %v", err)
	}
	if got != url {
		t.Errorf("PopURL got %q, want %q (frontier may contain other pending URLs from a prior run)", got, url)
	}
}

func TestGetURLByURL_MatchesSavedRow(t *testing.T) {
	store, _ := setupStore(t)
	ctx := context.Background()

	url := fmt.Sprintf("https://example.test/get-url-by-url-%d", time.Now().UnixNano())
	seed := models.URLFrontier{
		URL:      url,
		Source:   scoring.SourceGoodreads,
		Priority: scoring.CalculatePriority(scoring.SourceGoodreads, 0, 0),
	}

	inserted, err := store.SaveURL(ctx, seed)
	if err != nil {
		t.Fatalf("SaveURL failed: %v", err)
	}
	if !inserted {
		t.Fatalf("expected new URL to be inserted")
	}

	row, err := store.GetURLByURL(ctx, url)
	if err != nil {
		t.Fatalf("GetURLByURL failed: %v", err)
	}
	if row.Source != seed.Source {
		t.Errorf("got Source %q, want %q", row.Source, seed.Source)
	}
	if row.Status != "pending" {
		t.Errorf("got Status %q, want %q", row.Status, "pending")
	}

	if err := store.MarkURLDone(ctx, url); err != nil {
		t.Fatalf("MarkURLDone failed: %v", err)
	}

	row, err = store.GetURLByURL(ctx, url)
	if err != nil {
		t.Fatalf("GetURLByURL after MarkURLDone failed: %v", err)
	}
	if row.Status != "done" {
		t.Errorf("got Status %q after MarkURLDone, want %q", row.Status, "done")
	}
	if row.LastCrawledAt == nil {
		t.Errorf("expected LastCrawledAt to be set after MarkURLDone")
	}
}

// TestToscrapeLiveCrawlPipeline does a real HTTP fetch against quotes.toscrape.com — a public
// scraping sandbox with no anti-bot protection, built for exactly this — then runs the same
// parse -> save quotes -> push discovered URL pipeline as crawler.Run() against real Postgres
// and Redis. No fixtures, no mocking: this proves the whole path works against the live internet.
func TestToscrapeLiveCrawlPipeline(t *testing.T) {
	store, redisClient := setupStore(t)
	ctx := context.Background()

	const seedURL = "https://quotes.toscrape.com/"
	const source = "quotes.toscrape.com"

	seed := models.URLFrontier{
		URL:      seedURL,
		Source:   source,
		Priority: scoring.CalculatePriority(source, 0, 0),
	}
	if _, err := store.SaveURL(ctx, seed); err != nil {
		t.Fatalf("SaveURL(seed) failed: %v", err)
	}

	html, err := fetcher.Fetch(ctx, seedURL)
	if err != nil {
		t.Fatalf("live Fetch(%q) failed: %v", seedURL, err)
	}

	result, err := (&parser.ToscrapeParser{}).Parse(html)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	if len(result.Quotes) == 0 {
		t.Fatalf("got 0 quotes from a live fetch of %q", seedURL)
	}
	if len(result.NextURLs) != 1 {
		t.Fatalf("got %d NextURLs, want 1", len(result.NextURLs))
	}

	for _, quote := range result.Quotes {
		if _, err := store.SaveQuote(ctx, quote); err != nil {
			t.Errorf("SaveQuote(%q) failed: %v", quote.Text, err)
		}
	}

	nextURL := result.NextURLs[0]
	priority := scoring.CalculatePriority(source, 1, 0)
	frontier := models.URLFrontier{URL: nextURL, Source: source, Priority: priority, Depth: 1}
	if _, err := store.SaveURL(ctx, frontier); err != nil {
		t.Fatalf("SaveURL(next %q) failed: %v", nextURL, err)
	}
	if err := store.PushURL(ctx, source, nextURL, priority); err != nil {
		t.Fatalf("PushURL(next %q) failed: %v", nextURL, err)
	}

	// PopURL would drain the shared "frontier:<source>" ZSET (other tests/leftover state share
	// it), so verify the push landed by checking membership directly instead of consuming it.
	score, err := redisClient.ZScore(ctx, "frontier:"+source, nextURL).Result()
	if err != nil {
		t.Fatalf("ZScore(frontier, %q) failed: %v", nextURL, err)
	}
	if score != priority {
		t.Errorf("got frontier score %v for %q, want %v", score, nextURL, priority)
	}

	nextRow, err := store.GetURLByURL(ctx, nextURL)
	if err != nil {
		t.Fatalf("GetURLByURL(next %q) failed: %v", nextURL, err)
	}
	if nextRow.Depth != 1 {
		t.Errorf("got Depth %d, want 1", nextRow.Depth)
	}
}

// TestWikiquoteLiveCrawlPipeline does a real HTTP fetch against en.wikiquote.org — a
// MediaWiki site with no anti-bot protection, built for programmatic access — parses a
// real author page, and saves the quotes to real Postgres. WikiquoteParser doesn't yet
// discover NextURLs (see its doc comment), so there's no frontier push to verify here.
func TestWikiquoteLiveCrawlPipeline(t *testing.T) {
	store, _ := setupStore(t)
	ctx := context.Background()

	const seedURL = "https://en.wikiquote.org/wiki/Albert_Einstein"

	html, err := fetcher.Fetch(ctx, seedURL)
	if err != nil {
		t.Fatalf("live Fetch(%q) failed: %v", seedURL, err)
	}

	result, err := (&parser.WikiquoteParser{}).Parse(html)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	if len(result.Quotes) == 0 {
		t.Fatalf("got 0 quotes from a live fetch of %q", seedURL)
	}

	for _, quote := range result.Quotes {
		if quote.Author != "Albert Einstein" {
			t.Errorf("got Author %q, want %q", quote.Author, "Albert Einstein")
		}
		if _, err := store.SaveQuote(ctx, quote); err != nil {
			t.Errorf("SaveQuote(%q) failed: %v", quote.Text, err)
		}
	}
}

// TestGoodreadsLiveCrawlPipeline does a real HTTP fetch against goodreads.com — confirmed
// during source-reliability research to have no anti-bot wall and a robots.txt that allows
// crawling /quotes* for default user agents — parses a real tag page, saves the quotes, and
// pushes the real discovered next-page URL into Redis, verified via ZSCORE (see
// TestToscrapeLiveCrawlPipeline for why not PopURL).
func TestGoodreadsLiveCrawlPipeline(t *testing.T) {
	store, redisClient := setupStore(t)
	ctx := context.Background()

	const seedURL = "https://www.goodreads.com/quotes/tag/inspirational"
	const source = scoring.SourceGoodreads

	html, err := fetcher.Fetch(ctx, seedURL)
	if err != nil {
		t.Fatalf("live Fetch(%q) failed: %v", seedURL, err)
	}

	result, err := (&parser.GoodreadsParser{}).Parse(html)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	if len(result.Quotes) == 0 {
		t.Fatalf("got 0 quotes from a live fetch of %q", seedURL)
	}
	if len(result.NextURLs) != 1 {
		t.Fatalf("got %d NextURLs, want 1", len(result.NextURLs))
	}

	for _, quote := range result.Quotes {
		if _, err := store.SaveQuote(ctx, quote); err != nil {
			t.Errorf("SaveQuote(%q) failed: %v", quote.Text, err)
		}
	}

	nextURL := result.NextURLs[0]
	priority := scoring.CalculatePriority(source, 1, 0)
	frontier := models.URLFrontier{URL: nextURL, Source: source, Priority: priority, Depth: 1}
	if _, err := store.SaveURL(ctx, frontier); err != nil {
		t.Fatalf("SaveURL(next %q) failed: %v", nextURL, err)
	}
	if err := store.PushURL(ctx, source, nextURL, priority); err != nil {
		t.Fatalf("PushURL(next %q) failed: %v", nextURL, err)
	}

	score, err := redisClient.ZScore(ctx, "frontier:"+source, nextURL).Result()
	if err != nil {
		t.Fatalf("ZScore(frontier, %q) failed: %v", nextURL, err)
	}
	if score != priority {
		t.Errorf("got frontier score %v for %q, want %v", score, nextURL, priority)
	}
}
