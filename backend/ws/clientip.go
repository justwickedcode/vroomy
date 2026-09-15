package main

import (
	"net"
	"net/http"
	"strings"
)

// clientIP prefers X-Forwarded-For's first (original client) entry — this service is meant to
// run behind a reverse proxy in production (see README), which is what actually terminates
// client connections and sets that header; without it, every connection would appear to come
// from the proxy's own IP, and the per-IP concurrent-connection cap (ws.go) would apply to all
// visitors collectively instead of individually. Falls back to the direct connection's address,
// which is correct for local dev (no proxy in front) and is the best available answer if a
// proxy is present but misconfigured.
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
