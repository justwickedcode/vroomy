package fetcher

import (
	"errors"
	"testing"
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
