package db

import (
	"context"

	"github.com/redis/go-redis/v9"
)

func ConnectRedis(addr string, password string, db int) (*redis.Client, error) {
	var client *redis.Client

	opt, err := redis.ParseURL(addr)
	if err != nil {
		// not a URL, treat as plain host:port
		client = redis.NewClient(&redis.Options{
			Addr:     addr,
			Password: password,
			DB:       db,
		})
	} else {
		client = redis.NewClient(opt)
	}

	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}

	return client, nil
}
