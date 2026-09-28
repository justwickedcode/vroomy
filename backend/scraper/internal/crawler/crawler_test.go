package crawler

import (
	"fmt"
	"testing"
)

func TestSetLogLevel(t *testing.T) {
	// Restore the package-level default afterward so this test doesn't leak state into others.
	t.Cleanup(func() { configuredLogLevel = logLevelInfo })

	tests := []struct {
		input   string
		wantErr bool
		want    int
	}{
		{"", false, logLevelInfo},
		{"info", false, logLevelInfo},
		{"INFO", false, logLevelInfo}, // case-insensitive
		{"warn", false, logLevelWarn},
		{"warning", false, logLevelWarn},
		{"Warn", false, logLevelWarn},
		{"error", false, logLevelError},
		{"ERROR", false, logLevelError},
		{"debug", true, 0}, // not a real level — must fail loudly, not silently no-op
		{"quiet", true, 0},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("input=%q", tt.input), func(t *testing.T) {
			configuredLogLevel = logLevelInfo // reset before each case
			err := SetLogLevel(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Errorf("SetLogLevel(%q) = nil error, want an error", tt.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("SetLogLevel(%q) unexpected error: %s", tt.input, err)
			}
			if configuredLogLevel != tt.want {
				t.Errorf("SetLogLevel(%q) set level %d, want %d", tt.input, configuredLogLevel, tt.want)
			}
		})
	}
}
