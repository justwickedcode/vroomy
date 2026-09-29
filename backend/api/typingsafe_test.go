package main

import (
	"strings"
	"testing"
)

func TestMakeTypingSafe(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"wisdom—knowledge", "wisdom-knowledge"},
		{"between good and evil–ish", "between good and evil-ish"},
		{"it's a ‘quote’ within a “quote”", `it's a 'quote' within a "quote"`},
		{"wait for it…", "wait for it..."},
		{"already fine.", "already fine."},
		{"double  spaced   text", "double spaced text"},
		{"", ""},
	}

	for _, c := range cases {
		if got := MakeTypingSafe(c.input); got != c.expected {
			t.Errorf("MakeTypingSafe(%q) = %q, want %q", c.input, got, c.expected)
		}
	}
}

// TestMakeTypingSafePreservesLineBreaks is a regression test for a real interaction bug: this
// function used to flatten every '\n' to a space, which would have silently undone
// backend/scraper's own fix (preserveLineBreaks/normalizeWhitespace) that intentionally keeps a
// real line break for poem-shaped quotes so it can eventually be typed (Enter) in a race.
func TestMakeTypingSafePreservesLineBreaks(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"Line one\nLine two\nLine three", "Line one\nLine two\nLine three"},
		{"  extra   spaces  \n  on both  lines  ", "extra spaces\non both lines"},
		{"Line one\n\n\nLine two", "Line one\nLine two"}, // consecutive blank lines collapse away
		{"an em—dash\nspanning a line break", "an em-dash\nspanning a line break"},
	}
	for _, c := range cases {
		if got := MakeTypingSafe(c.input); got != c.expected {
			t.Errorf("MakeTypingSafe(%q) = %q, want %q", c.input, got, c.expected)
		}
	}
}

func TestMakeTypingSafePreservesWordBoundaries(t *testing.T) {
	// An em dash used mid-word must stay a single character joining the two halves, not gain
	// surrounding spaces — that would split one word into two, shifting every later word's
	// position, which would break the typing race's exact-match, position-based input handling.
	got := MakeTypingSafe("wisdom—knowledge is power")
	want := "wisdom-knowledge is power"
	if got != want {
		t.Errorf("MakeTypingSafe(...) = %q, want %q", got, want)
	}
	if fields := strings.Fields(got); len(fields) != 3 {
		t.Errorf("expected 3 words after normalization, got %d: %v", len(fields), fields)
	}
}
