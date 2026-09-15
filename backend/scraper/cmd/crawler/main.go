package main

import (
	"context"
	"os/exec"
	"os/signal"
	"quotes-crawler/internal/crawler"
	"strings"
	"syscall"

	"log"
	"os"
	"quotes-crawler/internal/db"

	"strconv"

	"github.com/joho/godotenv"
)

// logBuildInfo logs which git commit is currently checked out, so a running process's log
// immediately answers "is this actually on the latest code" instead of needing a live DB
// investigation to find out — exactly what happened once this session, when a running crawler
// kept saving quotes a just-added filter should have rejected.
//
// Deliberately shells out to git rather than using runtime/debug.ReadBuildInfo's automatic VCS
// stamp (the usual idiomatic approach): tested live in this exact environment and confirmed
// `go run` — how this crawler is actually started — does not embed VCS info at all (only
// `go build`/`go install` do here), so relying on it would have silently printed nothing useful
// for the one invocation method that matters. Fails soft (one log line, no crash) if git isn't
// on PATH or this isn't a git checkout at all — e.g. a container image without git installed.
func logBuildInfo() {
	revision, err := runGit("rev-parse", "--short=12", "HEAD")
	if err != nil {
		log.Printf("Starting quotes-crawler (could not determine build commit: %s)", err)
		return
	}

	dirty := false
	if status, err := runGit("status", "--porcelain"); err == nil && status != "" {
		dirty = true
	}

	if dirty {
		log.Printf("Starting quotes-crawler @ %s (dirty — uncommitted changes)", revision)
		return
	}
	log.Printf("Starting quotes-crawler @ %s", revision)
}

func runGit(args ...string) (string, error) {
	out, err := exec.Command("git", args...).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func main() {
	// NotifyContext, not context.Background(): SIGINT (Ctrl-C) or SIGTERM (e.g. `docker stop`,
	// a process manager restart) cancels ctx instead of killing the process outright, so the
	// worker goroutines in crawler.Run get a chance to stop cleanly — see runWorker/sleepCtx.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	logBuildInfo()

	// .env is a convenience for local dev — in a container, config comes from the environment
	// Docker/the orchestrator already injected, and there's no .env file present at all. Only
	// a genuine parse error (a malformed file that does exist) should be fatal; "the file just
	// isn't there" is the expected, normal case in production and must not crash startup.
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
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
	redisDB := 0
	if raw := os.Getenv("REDIS_DB"); raw != "" {
		redisDB, err = strconv.Atoi(raw)
		if err != nil {
			log.Fatal("Invalid REDIS_DB value: ", err)
		}
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
