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
