package main

import (
	"slices"
	"testing"
)

func TestNameScore_Forgiving(t *testing.T) {
	cases := []struct {
		name, query string
		match       bool
	}{
		{"John Smith", "john smith", true},
		{"John Smith", "JOHNSMITH", true},
		{"John Smith", "smi", true},  // a later word's start
		{"John Smith", "ohn", true},  // anywhere
		{"John Smith", "jonh", true}, // a typo
		{"José_92", "jose 92", true}, // accents, spaces, punctuation
		{"Alexandra", "alexandr", true},
		{"Alexandra", "alexnadra", true}, // two letters swapped in a long name
		{"John Smith", "xyz", false},
		{"Bo", "jo", false}, // too short to forgive typos in
	}
	for _, c := range cases {
		if got := nameScore(c.name, c.query) > 0; got != c.match {
			t.Errorf("nameScore(%q, %q) matched=%v, want %v", c.name, c.query, got, c.match)
		}
	}
}

func TestRankSearch_BestFirst(t *testing.T) {
	people := []searchCandidate{
		{id: "1", displayName: "Annabelle"},
		{id: "2", displayName: "Ann"},
		{id: "3", displayName: "Joanna"},
		{id: "4", displayName: "Zed", email: "ann@example.com"},
		{id: "5", displayName: "Bob"},
	}
	if got := rankSearch(people, "ann", 10); !slices.Equal(got, []string{"2", "1", "3"}) {
		t.Errorf("rankSearch(ann) = %v, want exact, then prefix, then inside", got)
	}
	if got := rankSearch(people, "Ann@Example.com", 10); len(got) == 0 || got[0] != "4" {
		t.Errorf("an exact email didn't find its player first: %v", got)
	}
	if got := rankSearch(people, "5", 10); len(got) == 0 || got[0] != "5" {
		t.Errorf("a player id (friend link) didn't find its player: %v", got)
	}
}
