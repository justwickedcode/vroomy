package fetcher

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// requestTimeout must stay comfortably above Goodreads' observed ~60s soft-throttle stalls
// (see README) — those still return a real 200 with valid content, so a shorter timeout would
// misclassify a slow-but-succeeding request as a failure. It exists to catch a genuinely dead
// connection (network black hole), not to react to ordinary throttling.
const requestTimeout = 90 * time.Second

// userAgent identifies this crawler per Wikimedia's User-Agent policy
// (https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy), which requires a descriptive
// User-Agent with a way to contact the operator — a generic one like the previous
// "quotes-crawler/1.0" is exactly what that policy exists to catch. Confirmed live this actually
// matters, not just a compliance nicety: plain `curl` (default User-Agent) against the same
// wikiquote.org endpoints, from the same VPS IP, at a *faster* rate than this crawler's own
// paced requests, got clean 200s the whole time, while the crawler was getting constant 429s —
// ruling out both an IP-level block and a volume/burst limit, and pointing squarely at the
// User-Agent (or another header the two clients differ on) as what was actually being flagged.
const userAgent = "vroomy-quotes-crawler/1.0 (https://github.com/justwickedcode/vroomy)"

// client is shared across every call to Fetch rather than constructed per-request. A fresh
// http.Client (as this used to build) means a fresh http.Transport, which means every single
// fetch pays for its own TCP handshake and TLS negotiation from scratch — no keep-alive reuse
// even across back-to-back requests to the same host (Goodreads, en/de.wikiquote.org), despite
// the crawler hitting only a handful of distinct hosts over and over. One shared client with a
// tuned Transport lets the standard library's connection pool actually do its job.
var client = &http.Client{
	Timeout: requestTimeout,
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}

// StatusError is returned by Fetch when the server responds with anything other than 200 OK —
// a typed error rather than just a formatted string, so a caller can check the actual status
// code (see IsRateLimited) instead of parsing the error message.
type StatusError struct {
	StatusCode int
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("unexpected status code: %d", e.StatusCode)
}

// IsRateLimited reports whether err is specifically a 429 Too Many Requests — a real rate-limit
// signal, as opposed to "some fetch failed" generally (a timeout, a 5xx, a DNS error, etc. are
// all real failures too, but only a 429 is direct evidence of hitting a rate limit).
func IsRateLimited(err error) bool {
	var se *StatusError
	return errors.As(err, &se) && se.StatusCode == http.StatusTooManyRequests
}

// Fetch takes a context so a caller's graceful shutdown (or any other cancellation) can cut an
// in-flight request short instead of always waiting up to requestTimeout — otherwise stopping
// the crawler could still block for up to 90s on whatever fetch happened to be in flight.
//
// Superseded: this used to also enforce a shared minimum delay across every request to any
// wikiquote.org host (one lock shared by all fourteen per-edition workers), on the theory that
// Wikimedia was rate-limiting by source IP across the whole family rather than per-subdomain.
// Reverted — that theory was wrong, or at least not the actual proximate cause. With fourteen
// concurrent workers serialized behind one shared minimum-delay lock, the unlucky last worker in
// the queue could wait up to ~13x that delay just for its turn, before any real network request
// even happened — and crawler.go's own stall detection (slowFetchWarn, >10s) misread that
// self-inflicted queueing delay as the source throttling us, piling an additional stall penalty
// on top and making the next round of queueing worse. Confirmed live that plain curl/wget from
// the same VPS, same IP, direct to both the IPv4 and IPv6 addresses Wikiquote resolves to, were
// all fast (well under a second) — ruling out DNS, IPv6, and the target server itself, and
// pointing squarely at the global limiter's own queueing as the cause. The User-Agent fix below
// (confirmed separately, before the global limiter existed) appears to have been the actual fix
// for the original 429 storm on its own; per-edition pacing (crawler.go's own minSourceDelayFor/
// abandonExperimentalPace) is what's relied on now, same as every other source.
func Fetch(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("User-Agent", userAgent)

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			fmt.Printf("error closing response body: %v\n", err)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return "", &StatusError{StatusCode: resp.StatusCode}
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return string(body), nil
}
