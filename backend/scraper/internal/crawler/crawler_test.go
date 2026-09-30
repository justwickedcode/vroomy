package crawler

import (
	"bytes"
	"fmt"
	"log"
	"strings"
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

func TestRecordQuotesSaved(t *testing.T) {
	origOutput := log.Writer()
	t.Cleanup(func() {
		log.SetOutput(origOutput)
		totalQuoteCount.Store(0)
	})

	tests := []struct {
		name          string
		start         int64
		add           int
		wantMilestone []string // milestone numbers expected to appear, in order
	}{
		{"no boundary crossed", 0, 500, nil},
		{"crosses exactly one boundary", 500, 500, []string{"1000"}},
		{"crosses one boundary mid-batch", 1997, 7, []string{"2000"}},
		{"crosses several boundaries in one batch", 999, 2005, []string{"1000", "2000", "3000"}},
		{"zero saved logs nothing", 1000, 0, nil},
		{"negative (shouldn't happen, but must not panic) logs nothing", 1000, -5, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			totalQuoteCount.Store(tt.start)
			var buf bytes.Buffer
			log.SetOutput(&buf)

			recordQuotesSaved(tt.add)

			output := buf.String()
			for _, want := range tt.wantMilestone {
				if !strings.Contains(output, want) {
					t.Errorf("recordQuotesSaved(%d) from start %d: expected output to mention %q, got: %s", tt.add, tt.start, want, output)
				}
			}
			gotLines := strings.Count(output, "Milestone:")
			if gotLines != len(tt.wantMilestone) {
				t.Errorf("recordQuotesSaved(%d) from start %d: logged %d milestone line(s), want %d (output: %s)", tt.add, tt.start, gotLines, len(tt.wantMilestone), output)
			}
		})
	}
}
