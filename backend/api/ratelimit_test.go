package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientIP(t *testing.T) {
	cases := []struct {
		name     string
		remote   string
		forward  string
		expected string
	}{
		{"no proxy", "203.0.113.5:54321", "", "203.0.113.5"},
		{"single forwarded IP", "10.0.0.1:1234", "203.0.113.9", "203.0.113.9"},
		{"forwarded chain uses the first (original client)", "10.0.0.1:1234", "203.0.113.9, 10.0.0.1", "203.0.113.9"},
	}

	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = c.remote
		if c.forward != "" {
			req.Header.Set("X-Forwarded-For", c.forward)
		}
		if got := clientIP(req); got != c.expected {
			t.Errorf("%s: clientIP() = %q, want %q", c.name, got, c.expected)
		}
	}
}

func TestRateLimiterBlocksAfterBurst(t *testing.T) {
	rl := newRateLimiter()
	ip := "203.0.113.1"

	allowed := 0
	for i := 0; i < burstSize+5; i++ {
		if rl.allow(ip) {
			allowed++
		}
	}
	if allowed != burstSize {
		t.Errorf("expected exactly %d requests allowed before throttling, got %d", burstSize, allowed)
	}

	// A different IP has its own independent budget, unaffected by the first one being spent.
	if !rl.allow("203.0.113.2") {
		t.Error("a different IP should not be throttled by another IP's usage")
	}
}
