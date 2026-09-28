package crawler

import (
	"testing"
	"time"
)

func TestInActiveWindow(t *testing.T) {
	at := func(hour int) time.Time {
		return time.Date(2026, 1, 1, hour, 0, 0, 0, time.UTC)
	}

	tests := []struct {
		name       string
		start, end int
		hour       int
		want       bool
	}{
		{"unconfigured is always active", -1, -1, 3, true},
		{"unconfigured is always active at any hour", -1, -1, 14, true},
		{"same-day window: inside", 0, 8, 3, true},
		{"same-day window: at start boundary", 0, 8, 0, true},
		{"same-day window: at end boundary is exclusive", 0, 8, 8, false},
		{"same-day window: outside", 0, 8, 12, false},
		{"wrapping window: inside evening side", 22, 6, 23, true},
		{"wrapping window: inside morning side", 22, 6, 3, true},
		{"wrapping window: at start boundary", 22, 6, 22, true},
		{"wrapping window: at end boundary is exclusive", 22, 6, 6, false},
		{"wrapping window: outside", 22, 6, 12, false},
		{"degenerate window (start == end) is always active", 5, 5, 5, true},
		{"degenerate window (start == end) is always active off-hour", 5, 5, 20, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := &Crawler{activeStartHour: tt.start, activeEndHour: tt.end}
			got := c.inActiveWindow(at(tt.hour))
			if got != tt.want {
				t.Errorf("inActiveWindow(hour=%d) with window [%d,%d) = %v, want %v", tt.hour, tt.start, tt.end, got, tt.want)
			}
		})
	}
}
