package main

import (
	"context"
	"quotes-crawler/internal/crawler"

	"log"
	"os"
	"quotes-crawler/internal/db"

	"strconv"

	"github.com/joho/godotenv"
)

func main() {
	ctx := context.Background()

	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env file: ", err)
	}

	// postgres
	pool, err := db.ConnectPostgres(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Could not connect to Postgres: ", err)
	}
	log.Println("Connected to Postgres!")

	if err = db.Migrate(pool); err != nil {
		log.Fatal("Could not migrate DB: ", err)
	}
	log.Println("Migrated database!")

	// redis
	redisDB, err := strconv.Atoi(os.Getenv("REDIS_DB"))
	if err != nil {
		log.Fatal("Invalid REDIS_DB value: ", err)
	}

	redisClient, err := db.ConnectRedis(os.Getenv("REDIS_ADDR"), os.Getenv("REDIS_PASSWORD"), redisDB)
	if err != nil {
		log.Fatal("Could not connect to Redis: ", err)
	}
	log.Println("Connected to Redis!")

	// store
	store := db.NewStore(pool, redisClient)

	c := crawler.New(store)

	if err := c.Run(ctx); err != nil {
		log.Fatal(err)
	}
}
