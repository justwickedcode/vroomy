package fetcher

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// requestTimeout must stay comfortably above Goodreads' observed ~60s soft-throttle stalls
// (see README) — those still return a real 200 with valid content, so a shorter timeout would
// misclassify a slow-but-succeeding request as a failure. It exists to catch a genuinely dead
// connection (network black hole), not to react to ordinary throttling.
const requestTimeout = 90 * time.Second

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

// wikiquoteGlobalMu/wikiquoteGlobalLastRequest enforce ONE shared minimum delay across every
// request to any *.wikiquote.org host, regardless of which of the crawler's many independent
// per-edition workers (internal/crawler.go, one goroutine per Wikiquote language) is making it.
//
// Found live: each edition's own per-edition cooldown (5-6s, paced independently in crawler.go)
// looked polite in isolation, but with fourteen editions running concurrently, the *combined*
// request rate to wikiquote.org — roughly one request every ~0.4s in aggregate — was still
// enough to trigger constant 429s across every single edition simultaneously. Confirmed this
// wasn't just one edition being too aggressive: editions that had already independently widened
// to their "proven-safe" 6s pace (via crawler.go's abandonExperimentalPace) kept getting
// rate-limited anyway. That rules out per-edition pacing as the fix entirely — Wikimedia is
// evidently rate-limiting by source IP across the whole wikiquote.org family, not per subdomain,
// so no amount of tuning any single edition's own delay can help; only a limiter shared across
// all of them, enforced here in the one place every Wikiquote request already funnels through
// (Fetch), can.
var (
	wikiquoteGlobalMu          sync.Mutex
	wikiquoteGlobalLastRequest time.Time
)

// wikiquoteGlobalMinDelay is a considered starting guess, not yet independently proven-safe the
// way the per-edition values in crawler.go were before this bug surfaced — the previous "safe"
// per-edition pace demonstrably was not actually safe in aggregate (see above), so this starts
// deliberately conservative rather than reusing that same discredited number. Re-tune from live
// 429 evidence after deploying, same as every other pacing constant in this codebase.
const wikiquoteGlobalMinDelay = 2 * time.Second

// isWikiquoteHost reports whether rawURL points at any wikiquote.org subdomain. Malformed input
// (which Fetch's own http.NewRequestWithContext would reject moments later anyway) is treated as
// "not wikiquote" rather than erroring here — this check exists purely to decide whether the
// shared limiter applies, not to validate the URL.
func isWikiquoteHost(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	return strings.HasSuffix(u.Hostname(), "wikiquote.org")
}

// waitForWikiquoteSlot blocks — holding wikiquoteGlobalMu for the duration, so every other
// concurrent Wikiquote caller queues behind it too; that's what actually turns fourteen
// independently-paced streams into one shared one — until at least wikiquoteGlobalMinDelay has
// passed since the last request to any wikiquote.org host. Returns true if ctx was cancelled
// while waiting, so Fetch can bail out the same way sleepCtx's callers do elsewhere in this
// codebase instead of still issuing the request after a shutdown signal.
func waitForWikiquoteSlot(ctx context.Context) bool {
	wikiquoteGlobalMu.Lock()
	defer wikiquoteGlobalMu.Unlock()

	if wait := wikiquoteGlobalMinDelay - time.Since(wikiquoteGlobalLastRequest); wait > 0 {
		timer := time.NewTimer(wait)
		defer timer.Stop()
		select {
		case <-timer.C:
		case <-ctx.Done():
			return true
		}
	}
	wikiquoteGlobalLastRequest = time.Now()
	return false
}

// Fetch takes a context so a caller's graceful shutdown (or any other cancellation) can cut an
// in-flight request short instead of always waiting up to requestTimeout — otherwise stopping
// the crawler could still block for up to 90s on whatever fetch happened to be in flight.
//
// A wikiquote.org URL additionally waits for the shared cross-edition limiter (see
// waitForWikiquoteSlot) before this function ever issues the request — every one of the
// crawler's Wikiquote-family workers funnels through this exact call, so this is the one place
// that can enforce a limit shared across all of them, not just Goodreads/Wikiquote as two
// domains but the whole wikiquote.org family as one.
func Fetch(ctx context.Context, url string) (string, error) {
	if isWikiquoteHost(url) {
		if waitForWikiquoteSlot(ctx) {
			return "", ctx.Err()
		}
	}

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("User-Agent", "quotes-crawler/1.0")

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
