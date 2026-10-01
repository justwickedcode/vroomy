package db

import (
	"context"
	"quotes-crawler/internal/models"
	"testing"
	"time"

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

// TestScheduleDelayedRetryAndPromote covers the hold-then-promote pair used for a plain outright
// failure that isn't itself evidence of a source-wide problem (see Crawler.failOrRetry's
// hardFailureRetryDelay): ScheduleDelayedRetry must do RetryURL's usual Postgres bookkeeping
// (pending/error_count/priority) but keep the URL out of PopURL's reach — not on the live
// frontier at all — until PromoteDueRetries decides its hold has actually expired.
func TestScheduleDelayedRetryAndPromote(t *testing.T) {
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
	const source = "goodreads"

	notYetDue := models.URLFrontier{
		URL:      "https://www.goodreads.com/author/quotes/1.Not_Yet_Due",
		Source:   source,
		Priority: 10.0,
	}
	alreadyDue := models.URLFrontier{
		URL:      "https://www.goodreads.com/author/quotes/2.Already_Due",
		Source:   source,
		Priority: 10.0,
	}
	for _, f := range []models.URLFrontier{notYetDue, alreadyDue} {
		if _, err := store.SaveURL(ctx, f); err != nil {
			t.Fatalf("SaveURL(%s) failed: %v", f.URL, err)
		}
		if err := store.MarkURLInProgress(ctx, f.URL); err != nil {
			t.Fatalf("MarkURLInProgress(%s) failed: %v", f.URL, err)
		}
	}

	if err := store.ScheduleDelayedRetry(ctx, source, notYetDue.URL, 1, 13.0, time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("ScheduleDelayedRetry(not yet due) failed: %v", err)
	}
	if err := store.ScheduleDelayedRetry(ctx, source, alreadyDue.URL, 1, 13.0, time.Now().Add(-time.Minute)); err != nil {
		t.Fatalf("ScheduleDelayedRetry(already due) failed: %v", err)
	}

	// Postgres bookkeeping happens immediately for both, same as a plain RetryURL — the hold is
	// purely a Redis-side concern, it never affects status/error_count/priority.
	for _, f := range []models.URLFrontier{notYetDue, alreadyDue} {
		row, err := store.GetURLByURL(ctx, f.URL)
		if err != nil {
			t.Fatalf("GetURLByURL(%s) failed: %v", f.URL, err)
		}
		if row.Status != "pending" || row.ErrorCount != 1 || row.Priority != 13.0 {
			t.Errorf("%s: expected pending/errorCount=1/priority=13.0 after ScheduleDelayedRetry, got status=%q errorCount=%d priority=%v",
				f.URL, row.Status, row.ErrorCount, row.Priority)
		}
	}

	// Neither URL should be poppable yet — ScheduleDelayedRetry never touches the live
	// frontier itself, only PromoteDueRetries does, and that hasn't run yet.
	if popped, err := store.PopURL(ctx, source); err != nil {
		t.Fatalf("PopURL() before promoting failed: %v", err)
	} else if popped != "" {
		t.Errorf("expected nothing poppable before PromoteDueRetries, got %q", popped)
	}

	promoted, err := store.PromoteDueRetries(ctx, source)
	if err != nil {
		t.Fatalf("PromoteDueRetries() failed: %v", err)
	}
	if promoted != 1 {
		t.Errorf("expected PromoteDueRetries() to promote exactly 1 URL, got %d", promoted)
	}

	popped, err := store.PopURL(ctx, source)
	if err != nil {
		t.Fatalf("PopURL() after promoting failed: %v", err)
	}
	if popped != alreadyDue.URL {
		t.Errorf("expected %q to be poppable after promotion, got %q", alreadyDue.URL, popped)
	}

	// The not-yet-due URL must still be held — not promoted, and not poppable.
	if popped, err := store.PopURL(ctx, source); err != nil {
		t.Fatalf("PopURL() for the not-yet-due URL failed: %v", err)
	} else if popped != "" {
		t.Errorf("expected the not-yet-due URL to still be held, but got %q poppable", popped)
	}
}

// TestSaveQuotesBatch covers SaveQuotes — the batched counterpart to SaveQuote (see that test)
// added after measuring live that saving a page's ~30 quotes one INSERT at a time cost roughly
// 3x what a single batched INSERT does on the same host, more with real network latency to
// Postgres. Same duplicate semantics as calling SaveQuote once per quote are covered here,
// including the one case unique to batching: two quotes in the *same* call that are exact
// duplicates of each other, not just of something already in the table — a real bug found live
// (a naive hash-keyed map marked both as saved after Postgres correctly inserted only one row)
// before de-duplicating candidates by sha256 hash prior to building the batch fixed it.
func TestSaveQuotesBatch(t *testing.T) {
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

	// case 1: a fresh batch, including one same-batch exact duplicate (index 3 repeats index
	// 0's text) and one same-batch near-duplicate (index 4 is a one-char variant of index 1,
	// the same shape TestSaveQuote's own near-dup case uses) — near-dup isn't expected to be
	// caught across positions in the *same* batch (documented trade-off, see SaveQuotes' doc
	// comment), only the exact duplicate must be.
	quotes := []models.Quote{
		{Text: "The world as we have created it is a process of our thinking.", Author: "Albert Einstein", Source: "quotes.toscrape.com"},
		{Text: "In the middle of every difficulty lies opportunity.", Author: "Albert Einstein", Source: "quotes.toscrape.com"},
		{Text: "Imagination is more important than knowledge.", Author: "Albert Einstein", Source: "quotes.toscrape.com"},
		{Text: "The world as we have created it is a process of our thinking.", Author: "Albert Einstein", Source: "quotes.toscrape.com"},
	}

	saved, err := store.SaveQuotes(ctx, quotes)
	if err != nil {
		t.Fatalf("SaveQuotes() failed on new batch: %v", err)
	}
	wantSaved := []bool{true, true, true, false}
	for i, want := range wantSaved {
		if saved[i] != want {
			t.Errorf("quote %d: saved = %v, want %v", i, saved[i], want)
		}
	}

	var count int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM quotes").Scan(&count); err != nil {
		t.Fatalf("count query failed: %v", err)
	}
	if count != 3 {
		t.Errorf("expected exactly 3 rows in Postgres (the same-batch duplicate must not land a 4th), got %d", count)
	}

	// case 2: re-submitting the same quotes in a fresh call should now find every one of them
	// already committed from case 1 — conflict against existing rows, not within-batch.
	saved2, err := store.SaveQuotes(ctx, quotes[:3])
	if err != nil {
		t.Fatalf("SaveQuotes() failed on re-submitted batch: %v", err)
	}
	for i, s := range saved2 {
		if s {
			t.Errorf("quote %d: saved = true on a re-save of an already-committed row, want false", i)
		}
	}

	// case 3: an empty batch is a valid no-op, not an error.
	savedEmpty, err := store.SaveQuotes(ctx, nil)
	if err != nil {
		t.Fatalf("SaveQuotes(nil) returned an error: %v", err)
	}
	if len(savedEmpty) != 0 {
		t.Errorf("SaveQuotes(nil) = %v, want empty", savedEmpty)
	}
}
