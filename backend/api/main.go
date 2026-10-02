package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"quotes-api/internal/db"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// .env is a convenience for local dev — in a container, config comes from the environment
	// Docker/the orchestrator already injected, and there's no .env file present at all. Only
	// a genuine parse error (a malformed file that does exist) should be fatal; "the file just
	// isn't there" is the expected, normal case in production and must not crash startup.
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		log.Fatal("Error loading .env file: ", err)
	}

	// This API only ever reads the quotes table — backend/scraper owns that schema (its own
	// migrations create and evolve the quotes/url_frontier tables), and api never writes to or
	// migrates it. api does own and migrate its own separate tables (users, race_results) —
	// see internal/db/migrate.go for why that's safe to run from a second independent binary
	// against the same database without colliding with the scraper's own migration history.
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Could not connect to Postgres: ", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatal("Could not reach Postgres: ", err)
	}
	log.Println("Connected to Postgres!")

	if err := db.Migrate(pool); err != nil {
		log.Fatal("Could not migrate api's own tables: ", err)
	}
	log.Println("api's own tables (users, race_results) are up to date")

	allowedOrigin := os.Getenv("CORS_ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:3000"
	}
	port := os.Getenv("API_PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      newServer(pool, allowedOrigin),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		<-ctx.Done()
		log.Println("Shutting down API server...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("Error during server shutdown: %s\n", err)
		}
	}()

	log.Printf("Quotes API listening on :%s (allowing requests from %s)\n", port, allowedOrigin)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal("Server error: ", err)
	}
	log.Println("API server stopped")
}
