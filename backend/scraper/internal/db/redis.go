package db

import (
	"context"
	"strings"

	"github.com/redis/go-redis/v9"
)

// ConnectRedis accepts either a plain "host:port" address or a full "redis://"/"rediss://" URL.
// Only attempts redis.ParseURL for input that actually looks like a URL — found live, testing
// a real containerized deployment, that redis.ParseURL("redis:6379") does NOT return an error:
// it silently parses "redis" as a URL *scheme* (a bare "host:port" is valid opaque-URI syntax)
// and produces Addr="localhost:6379", discarding the real host entirely. That went unnoticed in
// every dev/local run so far only because REDIS_ADDR has always literally been "localhost:6379"
// there — the same wrong answer, by coincidence. In a container, REDIS_ADDR is a Docker service
// name like "redis:6379", where this silently connects to the wrong host instead of failing
// loudly. Checking for "://" first avoids ever calling ParseURL on a value it will misinterpret.
func ConnectRedis(addr string, password string, db int) (*redis.Client, error) {
	var client *redis.Client

	if strings.Contains(addr, "://") {
		opt, err := redis.ParseURL(addr)
		if err != nil {
			return nil, err
		}
		client = redis.NewClient(opt)
	} else {
		client = redis.NewClient(&redis.Options{
			Addr:     addr,
			Password: password,
			DB:       db,
		})
	}

	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}

	return client, nil
}
