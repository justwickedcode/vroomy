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
func Fetch(ctx context.Context, url string) (string, error) {
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
