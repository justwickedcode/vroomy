package db

import (
	"context"
	"testing"

	"github.com/testcontainers/testcontainers-go/modules/redis"
)

// TestConnectRedisPlainHostPort is a real regression test: found live, testing a containerized
// deployment, that ConnectRedis previously misrouted a plain "host:port" address (e.g. a Docker
// service name like "redis:6379") to localhost instead — redis.ParseURL("redis:6379") doesn't
// error, it silently parses "redis" as a URL scheme and produces Addr="localhost:6379". This
// went unnoticed in every local run before now only because REDIS_ADDR has always literally
// been "localhost:6379" in dev — the same wrong answer, by coincidence.
func TestConnectRedisPlainHostPort(t *testing.T) {
	ctx := context.Background()

	redisContainer, err := redis.Run(ctx, "redis:7-alpine")
	if err != nil {
		t.Fatalf("could not start redis container: %v", err)
	}
	defer func() {
		if err := redisContainer.Terminate(ctx); err != nil {
			t.Fatalf("could not terminate redis container: %v", err)
		}
	}()

	// ConnectionString returns a full "redis://host:port" URL; strip the scheme to get exactly
	// the "host:port" shape a Docker Compose service address (e.g. "redis:6379") actually has —
	// the case that silently broke before this fix.
	fullURL, err := redisContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("could not get redis connection string: %v", err)
	}
	hostPort := fullURL
	if idx := len("redis://"); len(fullURL) > idx && fullURL[:idx] == "redis://" {
		hostPort = fullURL[idx:]
	}

	client, err := ConnectRedis(hostPort, "", 0)
	if err != nil {
		t.Fatalf("ConnectRedis(%q) failed: %v", hostPort, err)
	}
	defer client.Close()

	if err := client.Ping(ctx).Err(); err != nil {
		t.Errorf("client from ConnectRedis(%q) cannot actually reach the server: %v", hostPort, err)
	}
}
