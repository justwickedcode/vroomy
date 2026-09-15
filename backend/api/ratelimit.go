package main

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

const (
	// requestsPerMinute/burstSize: this API has no accounts or API keys — it's called directly
	// from any visitor's browser — so per-IP rate limiting is the only practical abuse control
	// available. Sized generously for real usage: the typing race fetches one new sentence per
	// race (roughly every 10-60+ seconds for an actual player), so a legitimate client should
	// never come close to this; it exists to stop a script hammering the endpoint, not to
	// throttle real players.
	requestsPerMinute = 30
	burstSize         = 10

	// visitorTTL: how long a per-IP limiter is kept around after its last request before being
	// cleaned up. Without this, every distinct IP that ever hits the API leaves a limiter in
	// memory forever — a slow, unbounded leak for a public endpoint.
	visitorTTL = 10 * time.Minute
)

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// rateLimiter tracks one token-bucket limiter per client IP. Safe for concurrent use — every
// method takes the mutex; the janitor goroutine (started by withRateLimit) is the only other
// thing that touches the map.
type rateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{visitors: make(map[string]*visitor)}
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	v, ok := rl.visitors[ip]
	if !ok {
		v = &visitor{limiter: rate.NewLimiter(rate.Every(time.Minute/requestsPerMinute), burstSize)}
		rl.visitors[ip] = v
	}
	v.lastSeen = time.Now()
	rl.mu.Unlock()

	return v.limiter.Allow()
}

func (rl *rateLimiter) cleanupStale() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	for ip, v := range rl.visitors {
		if time.Since(v.lastSeen) > visitorTTL {
			delete(rl.visitors, ip)
		}
	}
}

// clientIP prefers X-Forwarded-For's first (original client) entry — this API is meant to run
// behind a reverse proxy in production (see README), which is what actually terminates client
// connections and sets that header; without it, every request would appear to come from the
// proxy's own IP, and rate limiting would apply to all visitors collectively instead of
// individually. Falls back to the direct connection's address, which is correct for local dev
// (no proxy in front) and is the best available answer if a proxy is present but misconfigured.
func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		first, _, _ := strings.Cut(forwarded, ",")
		return strings.TrimSpace(first)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// withRateLimit wraps next with per-IP rate limiting and starts a background janitor that
// evicts limiters for IPs that haven't been seen in a while. The janitor stops when ctx done
// isn't wired up here deliberately — this runs for the lifetime of the process, same as the
// server itself; there's nothing else for it to be scoped to.
func withRateLimit(next http.Handler) http.Handler {
	rl := newRateLimiter()
	go func() {
		for range time.Tick(visitorTTL) {
			rl.cleanupStale()
		}
	}()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.allow(clientIP(r)) {
			writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
			return
		}
		next.ServeHTTP(w, r)
	})
}
