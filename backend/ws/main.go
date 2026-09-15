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

	// This service only ever reads the quotes table — it deliberately does not run migrations.
	// backend/scraper owns the schema; run it at least once against a fresh database before
	// starting this service.
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Could not connect to Postgres: ", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatal("Could not reach Postgres: ", err)
	}
	log.Println("Connected to Postgres!")

	allowedOrigin := os.Getenv("CORS_ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:3000"
	}
	port := os.Getenv("WS_PORT")
	if port == "" {
		port = "8081"
	}

	configureUpgrader(allowedOrigin)
	// One counter shared across every /ws/* route — see maxConnectionsPerIP's doc comment in
	// ws.go: the cap is meant to bound one visitor's total concurrently-open connections, not
	// give them a separate allowance per endpoint.
	conns := newIPConnCounter()
	mm := newMatchmaker(pool)
	pr := newPrivateRooms(pool)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws/race", handleRaceWebSocket(mm, conns))
	mux.HandleFunc("GET /ws/private/create", handleCreatePrivateRoom(pr, conns))
	mux.HandleFunc("GET /ws/private/join", handleJoinPrivateRoom(pr, conns))
	mux.HandleFunc("GET /health", handleHealth(pool))

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
		// No ReadTimeout/WriteTimeout here — both apply to the entire connection lifetime in
		// net/http, which would forcibly close every /ws/race connection (a whole lobby wait
		// plus race, potentially several minutes) after 10s. The WebSocket side manages its own
		// per-message deadlines and ping/pong keepalive instead (see client.go); /health is a
		// single fast Postgres query with no realistic way to hang long enough for a
		// connection-level timeout to have mattered.
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		<-ctx.Done()
		log.Println("Shutting down WS server...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("Error during server shutdown: %s\n", err)
		}
	}()

	log.Printf("Quotes WS listening on :%s (allowing connections from %s)\n", port, allowedOrigin)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal("Server error: ", err)
	}
	log.Println("WS server stopped")
}

func handleHealth(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := pool.Ping(r.Context()); err != nil {
			http.Error(w, `{"error":"database unreachable"}`, http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	}
}
