package main

import (
	"errors"
	"testing"
	"time"
)

func TestParseDailyDate(t *testing.T) {
	now := time.Date(2026, 10, 16, 23, 30, 0, 0, time.UTC)

	cases := []struct {
		raw     string
		want    string
		wantErr bool
	}{
		{raw: "", want: "2026-10-16"},
		{raw: "2026-10-16", want: "2026-10-16"},
		{raw: "2026-10-15", want: "2026-10-15"}, // still "today" west of UTC
		{raw: "2026-10-17", want: "2026-10-17"}, // already "tomorrow" east of UTC
		{raw: "2026-10-14", wantErr: true},
		{raw: "2026-10-18", wantErr: true},
		{raw: "16.10.2026", wantErr: true},
		{raw: "2026-13-01", wantErr: true},
	}

	for _, c := range cases {
		got, err := parseDailyDate(c.raw, now)
		if c.wantErr {
			if err == nil {
				t.Errorf("parseDailyDate(%q) = %v, want error", c.raw, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseDailyDate(%q) unexpected error: %v", c.raw, err)
			continue
		}
		if got.Format(dailyDateLayout) != c.want {
			t.Errorf("parseDailyDate(%q) = %s, want %s", c.raw, got.Format(dailyDateLayout), c.want)
		}
	}

	if _, err := parseDailyDate("2026-10-20", now); !errors.Is(err, errDateOutOfRange) {
		t.Errorf("far-future date: got %v, want errDateOutOfRange", err)
	}
}
