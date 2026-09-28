package fetcher

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestIsRateLimited(t *testing.T) {
	cases := []struct {
		name     string
		err      error
		expected bool
	}{
		{"429 status error", &StatusError{StatusCode: 429}, true},
		{"200 status error (shouldn't happen, but not a rate limit if it did)", &StatusError{StatusCode: 200}, false},
		{"404 status error", &StatusError{StatusCode: 404}, false},
		{"500 status error", &StatusError{StatusCode: 500}, false},
		{"nil error", nil, false},
		{"unrelated error", errors.New("connection refused"), false},
		{"wrapped 429 status error", fmtErrorf(&StatusError{StatusCode: 429}), true},
	}

	for _, c := range cases {
		if got := IsRateLimited(c.err); got != c.expected {
			t.Errorf("%s: IsRateLimited() = %v, want %v", c.name, got, c.expected)
		}
	}
}

func fmtErrorf(err error) error {
	return errors.Join(err) // preserves errors.As unwrapping, unlike fmt.Errorf without %w
}

func TestStatusErrorMessage(t *testing.T) {
	err := &StatusError{StatusCode: 429}
	if err.Error() != "unexpected status code: 429" {
		t.Errorf("StatusError.Error() = %q, want %q", err.Error(), "unexpected status code: 429")
	}
}

func TestIsWikiquoteHost(t *testing.T) {
	cases := []struct {
		name string
		url  string
		want bool
	}{
		{"English Wikiquote", "https://en.wikiquote.org/wiki/Mark_Twain", true},
		{"German Wikiquote", "https://de.wikiquote.org/wiki/Goethe", true},
		{"Finnish Wikiquote API", "https://fi.wikiquote.org/w/api.php?action=query", true},
		{"Goodreads is not Wikiquote", "https://www.goodreads.com/quotes/tag/inspirational", false},
		{"toscrape is not Wikiquote", "https://quotes.toscrape.com/", false},
		{"a host that merely contains wikiquote.org as a substring elsewhere", "https://evil.example.com/wikiquote.org", false},
		{"malformed URL", "://not a url", false},
		{"empty string", "", false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := isWikiquoteHost(c.url); got != c.want {
				t.Errorf("isWikiquoteHost(%q) = %v, want %v", c.url, got, c.want)
			}
		})
	}
}

// resetWikiquoteGlobalState is called before/after each waitForWikiquoteSlot test so they don't
// leak timing state into each other or into a real Fetch call elsewhere in the suite.
func resetWikiquoteGlobalState(t *testing.T) {
	t.Helper()
	wikiquoteGlobalMu.Lock()
	wikiquoteGlobalLastRequest = time.Time{}
	wikiquoteGlobalMu.Unlock()
	t.Cleanup(func() {
		wikiquoteGlobalMu.Lock()
		wikiquoteGlobalLastRequest = time.Time{}
		wikiquoteGlobalMu.Unlock()
	})
}

func TestWaitForWikiquoteSlotReturnsImmediatelyWhenLastRequestWasLongAgo(t *testing.T) {
	resetWikiquoteGlobalState(t)
	wikiquoteGlobalMu.Lock()
	wikiquoteGlobalLastRequest = time.Now().Add(-10 * time.Second)
	wikiquoteGlobalMu.Unlock()

	start := time.Now()
	cancelled := waitForWikiquoteSlot(context.Background())
	elapsed := time.Since(start)

	if cancelled {
		t.Fatal("waitForWikiquoteSlot reported cancelled with a non-cancelled context")
	}
	if elapsed > 100*time.Millisecond {
		t.Errorf("waitForWikiquoteSlot took %s for a slot that should already be free", elapsed)
	}
}

func TestWaitForWikiquoteSlotWaitsWhenCalledBackToBack(t *testing.T) {
	resetWikiquoteGlobalState(t)
	wikiquoteGlobalMu.Lock()
	wikiquoteGlobalLastRequest = time.Now()
	wikiquoteGlobalMu.Unlock()

	start := time.Now()
	cancelled := waitForWikiquoteSlot(context.Background())
	elapsed := time.Since(start)

	if cancelled {
		t.Fatal("waitForWikiquoteSlot reported cancelled with a non-cancelled context")
	}
	// Allow some slack below the exact delay — timers aren't perfectly precise — but it must
	// have waited close to the real minimum, not returned near-instantly.
	if elapsed < wikiquoteGlobalMinDelay-200*time.Millisecond {
		t.Errorf("waitForWikiquoteSlot only waited %s, want close to %s", elapsed, wikiquoteGlobalMinDelay)
	}
}

func TestWaitForWikiquoteSlotReturnsTrueOnCancellation(t *testing.T) {
	resetWikiquoteGlobalState(t)
	wikiquoteGlobalMu.Lock()
	wikiquoteGlobalLastRequest = time.Now() // forces a wait
	wikiquoteGlobalMu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already cancelled before the call

	start := time.Now()
	cancelled := waitForWikiquoteSlot(ctx)
	elapsed := time.Since(start)

	if !cancelled {
		t.Fatal("waitForWikiquoteSlot did not report cancellation for an already-cancelled context")
	}
	if elapsed > 100*time.Millisecond {
		t.Errorf("waitForWikiquoteSlot took %s to notice cancellation, want near-instant", elapsed)
	}
}
