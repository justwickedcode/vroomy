package db

import (
	"context"
	"quotes-crawler/internal/models"
	"testing"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/modules/redis"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestSaveQuote(t *testing.T) {
	ctx := context.Background()

	// Postgres setup
	// spin up a fresh isolated postgres container for this test
	pgContainer, err := postgres.Run(ctx,
		"postgres:16",
		postgres.WithDatabase("testdb"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").WithOccurrence(2)),
	)
	if err != nil {
		t.Fatalf("could not start postgres container: %v", err)
	}
	defer func(pgContainer *postgres.PostgresContainer, ctx context.Context, opts ...testcontainers.TerminateOption) {
		if err := pgContainer.Terminate(ctx, opts...); err != nil {
			t.Fatalf("could not terminate postgres container: %v", err)
		}
	}(pgContainer, ctx)

	// connect and run migrations so the schema is ready
	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("could not get postgres connection string: %v", err)
	}

	pool, err := ConnectPostgres(connStr)
	if err != nil {
		t.Fatalf("could not connect to postgres: %v", err)
	}
	defer pool.Close()

	if err := Migrate(pool); err != nil {
		t.Fatalf("could not run migrations: %v", err)
	}

	// Redis setup
	// spin up a fresh isolated redis container for this test
	redisContainer, err := redis.Run(ctx, "redis:7-alpine")
	if err != nil {
		t.Fatalf("could not start redis container: %v", err)
	}
	defer func() {
		if err := redisContainer.Terminate(ctx); err != nil {
			t.Fatalf("could not terminate redis container: %v", err)
		}
	}()

	redisAddr, err := redisContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("could not get redis connection string: %v", err)
	}

	redisClient, err := ConnectRedis(redisAddr, "", 0)
	if err != nil {
		t.Fatalf("could not connect to redis: %v", err)
	}

	// Store
	store := NewStore(pool, redisClient)

	// base quote used across multiple test cases
	quote := models.Quote{
		Text:   "The world as we have created it is a process of our thinking.",
		Author: "Albert Einstein",
		Tags:   []string{"thinking", "world"},
		Source: "quotes.toscrape.com",
	}

	// case 1: inserting a new quote should succeed
	inserted, err := store.SaveQuote(ctx, quote)
	if err != nil {
		t.Fatalf("SaveQuote() failed on new quote: %v", err)
	}
	if !inserted {
		t.Errorf("expected new quote to be inserted, got false")
	}

	// case 2: inserting the exact same quote should be skipped (SHA256 conflict)
	inserted, err = store.SaveQuote(ctx, quote)
	if err != nil {
		t.Fatalf("SaveQuote() failed on exact duplicate: %v", err)
	}
	if inserted {
		t.Errorf("expected exact duplicate to be skipped, got true")
	}

	// case 3: inserting a near-duplicate (one char difference) should be skipped (LSH + Hamming catches it)
	nearDup := models.Quote{
		Text:   "The world as we have created it is a process of our thinking!",
		Author: "Albert Einstein",
		Tags:   []string{"thinking", "world"},
		Source: "quotes.toscrape.com",
	}
	inserted, err = store.SaveQuote(ctx, nearDup)
	if err != nil {
		t.Fatalf("SaveQuote() failed on near duplicate: %v", err)
	}
	if inserted {
		t.Errorf("expected near duplicate to be skipped, got true")
	}

	// case 4: inserting a completely different quote should succeed
	different := models.Quote{
		Text:   "In the middle of every difficulty lies opportunity.",
		Author: "Albert Einstein",
		Tags:   []string{"opportunity"},
		Source: "quotes.toscrape.com",
	}
	inserted, err = store.SaveQuote(ctx, different)
	if err != nil {
		t.Fatalf("SaveQuote() failed on different quote: %v", err)
	}
	if !inserted {
		t.Errorf("expected different quote to be inserted, got false")
	}
}

func TestSaveURLsBatch(t *testing.T) {
	ctx := context.Background()

	pgContainer, err := postgres.Run(ctx,
		"postgres:16",
		postgres.WithDatabase("testdb"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").WithOccurrence(2)),
	)
	if err != nil {
		t.Fatalf("could not start postgres container: %v", err)
	}
	defer func(pgContainer *postgres.PostgresContainer, ctx context.Context, opts ...testcontainers.TerminateOption) {
		if err := pgContainer.Terminate(ctx, opts...); err != nil {
			t.Fatalf("could not terminate postgres container: %v", err)
		}
	}(pgContainer, ctx)

	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("could not get postgres connection string: %v", err)
	}

	pool, err := ConnectPostgres(connStr)
	if err != nil {
		t.Fatalf("could not connect to postgres: %v", err)
	}
	defer pool.Close()

	if err := Migrate(pool); err != nil {
		t.Fatalf("could not run migrations: %v", err)
	}

	redisContainer, err := redis.Run(ctx, "redis:7-alpine")
	if err != nil {
		t.Fatalf("could not start redis container: %v", err)
	}
	defer func() {
		if err := redisContainer.Terminate(ctx); err != nil {
			t.Fatalf("could not terminate redis container: %v", err)
		}
	}()

	redisAddr, err := redisContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("could not get redis connection string: %v", err)
	}

	redisClient, err := ConnectRedis(redisAddr, "", 0)
	if err != nil {
		t.Fatalf("could not connect to redis: %v", err)
	}

	store := NewStore(pool, redisClient)

	urls := []string{
		"https://en.wikiquote.org/wiki/Mark_Twain",
		"https://en.wikiquote.org/wiki/Oscar_Wilde",
		"https://en.wikiquote.org/wiki/Maya_Angelou",
	}

	// case 1: a fresh batch should all be reported as newly inserted
	inserted, err := store.SaveURLsBatch(ctx, urls, "wikiquote", 2.0, 0)
	if err != nil {
		t.Fatalf("SaveURLsBatch() failed on new batch: %v", err)
	}
	if len(inserted) != len(urls) {
		t.Errorf("expected all %d URLs to be newly inserted, got %d", len(urls), len(inserted))
	}

	// case 2: re-submitting a batch that overlaps with the first should only report the new one
	overlapping := []string{urls[0], urls[1], "https://en.wikiquote.org/wiki/Winston_Churchill"}
	inserted, err = store.SaveURLsBatch(ctx, overlapping, "wikiquote", 2.0, 0)
	if err != nil {
		t.Fatalf("SaveURLsBatch() failed on overlapping batch: %v", err)
	}
	if len(inserted) != 1 || inserted[0] != "https://en.wikiquote.org/wiki/Winston_Churchill" {
		t.Errorf("expected only the new URL to be reported inserted, got %v", inserted)
	}

	// case 3: pushing the first batch to Redis should make all of them poppable from that source's queue
	if err := store.PushURLsBatch(ctx, "wikiquote", urls, 2.0); err != nil {
		t.Fatalf("PushURLsBatch() failed: %v", err)
	}
	popped := make(map[string]bool)
	for i := 0; i < len(urls); i++ {
		u, err := store.PopURL(ctx, "wikiquote")
		if err != nil {
			t.Fatalf("PopURL() failed: %v", err)
		}
		popped[u] = true
	}
	for _, u := range urls {
		if !popped[u] {
			t.Errorf("expected %q to have been pushed and poppable, but it wasn't", u)
		}
	}
}

func TestRetryURL(t *testing.T) {
	ctx := context.Background()

	pgContainer, err := postgres.Run(ctx,
		"postgres:16",
		postgres.WithDatabase("testdb"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").WithOccurrence(2)),
	)
	if err != nil {
		t.Fatalf("could not start postgres container: %v", err)
	}
	defer func(pgContainer *postgres.PostgresContainer, ctx context.Context, opts ...testcontainers.TerminateOption) {
		if err := pgContainer.Terminate(ctx, opts...); err != nil {
			t.Fatalf("could not terminate postgres container: %v", err)
		}
	}(pgContainer, ctx)

	connStr, err := pgContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("could not get postgres connection string: %v", err)
	}

	pool, err := ConnectPostgres(connStr)
	if err != nil {
		t.Fatalf("could not connect to postgres: %v", err)
	}
	defer pool.Close()

	if err := Migrate(pool); err != nil {
		t.Fatalf("could not run migrations: %v", err)
	}

	redisContainer, err := redis.Run(ctx, "redis:7-alpine")
	if err != nil {
		t.Fatalf("could not start redis container: %v", err)
	}
	defer func() {
		if err := redisContainer.Terminate(ctx); err != nil {
			t.Fatalf("could not terminate redis container: %v", err)
		}
	}()

	redisAddr, err := redisContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("could not get redis connection string: %v", err)
	}

	redisClient, err := ConnectRedis(redisAddr, "", 0)
	if err != nil {
		t.Fatalf("could not connect to redis: %v", err)
	}

	store := NewStore(pool, redisClient)

	frontier := models.URLFrontier{
		URL:      "https://www.goodreads.com/quotes/tag/retry-test",
		Source:   "goodreads",
		Priority: 10.0,
	}
	if _, err := store.SaveURL(ctx, frontier); err != nil {
		t.Fatalf("SaveURL() failed: %v", err)
	}
	if err := store.MarkURLInProgress(ctx, frontier.URL); err != nil {
		t.Fatalf("MarkURLInProgress() failed: %v", err)
	}

	// a failed fetch mid-crawl should be able to reset the row back to pending, with a bumped
	// error_count and a new (typically worse) priority — not stuck at in_progress or failed.
	if err := store.RetryURL(ctx, frontier.URL, 1, 13.0); err != nil {
		t.Fatalf("RetryURL() failed: %v", err)
	}

	row, err := store.GetURLByURL(ctx, frontier.URL)
	if err != nil {
		t.Fatalf("GetURLByURL() failed: %v", err)
	}
	if row.Status != "pending" {
		t.Errorf("expected status = pending after RetryURL, got %q", row.Status)
	}
	if row.ErrorCount != 1 {
		t.Errorf("expected error_count = 1 after RetryURL, got %d", row.ErrorCount)
	}
	if row.Priority != 13.0 {
		t.Errorf("expected priority = 13.0 after RetryURL, got %v", row.Priority)
	}
}
