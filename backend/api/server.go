package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// defaultMinWords/defaultMaxWords match the frontend's own placeholder-sentence design
	// (frontend/src/lib/typing/sentences.ts): short passages finish in a couple of seconds
	// even for an average typist, and extrapolating a multi-second burst to a per-minute rate
	// is numerically unstable, so the game needs genuinely long passages, not just "a quote."
	defaultMinWords = 25
	defaultMaxWords = 60

	// maxWordsCeiling bounds what a client can ask for — not a real limitation (nothing needs
	// more than a couple hundred words for a typing race), just a sanity cap so a malformed or
	// hostile request can't ask for something absurd.
	maxWordsCeiling = 200
)

// newServer builds the API's HTTP handler: CORS-wrapped routes over pool. allowedOrigin is the
// single origin allowed to call this API cross-origin (the frontend's dev or prod URL) — this
// API has no auth of its own, so it's only meant to be reachable from that one known frontend,
// not the open internet generally.
func newServer(pool *pgxpool.Pool, allowedOrigin string) http.Handler {
	mux := http.NewServeMux()
	// Rate limiting is scoped to the actual public endpoint only, not /health — a Docker/
	// orchestrator healthcheck polls that every few seconds, and sharing a limiter with it
	// would risk the healthcheck itself tripping the limit and reporting a false outage.
	mux.Handle("GET /api/quotes/random", withRateLimit(handleRandomQuote(pool)))
	mux.HandleFunc("GET /health", handleHealth(pool))
	// CORS first: its OPTIONS preflight short-circuit must never consume a rate-limit token —
	// a browser sends one before every real cross-origin request, so counting it would halve
	// the effective limit for no reason.
	return withCORS(allowedOrigin, mux)
}

func withCORS(allowedOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("Could not write JSON response: %s\n", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// handleRandomQuote serves GET /api/quotes/random?language=en&minWords=25&maxWords=60&exclude=...
// All query params are optional; language/minWords/maxWords default to the same values the
// frontend's own static placeholder pool was tuned for (see defaultMinWords/defaultMaxWords).
func handleRandomQuote(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()

		language := query.Get("language")
		if language == "" {
			language = "en"
		}

		minWords, err := parseWordCountParam(query.Get("minWords"), defaultMinWords)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid minWords")
			return
		}
		maxWords, err := parseWordCountParam(query.Get("maxWords"), defaultMaxWords)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid maxWords")
			return
		}
		if minWords > maxWords {
			writeError(w, http.StatusBadRequest, "minWords must not exceed maxWords")
			return
		}

		quote, err := RandomTypingQuote(r.Context(), pool, language, minWords, maxWords, query.Get("exclude"))
		if errors.Is(err, ErrNoEligibleQuote) {
			writeError(w, http.StatusNotFound, "no quote matches the requested filters")
			return
		}
		if err != nil {
			log.Printf("RandomTypingQuote failed: %s\n", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}

		writeJSON(w, http.StatusOK, quote)
	}
}

func parseWordCountParam(raw string, fallback int) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 || n > maxWordsCeiling {
		return 0, errors.New("out of range")
	}
	return n, nil
}

func handleHealth(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := pool.Ping(r.Context()); err != nil {
			writeError(w, http.StatusServiceUnavailable, "database unreachable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
