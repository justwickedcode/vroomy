package main

import (
	"sort"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// Finding someone to add as a friend shouldn't take spelling their name exactly. A search
// matches a player when, ignoring case, accents, spaces and punctuation ("José_92" is "jose92"):
//
//   - it's their whole name, the start of it, or the start of any word in it ("ana" finds
//     "Maria Ana"), or anywhere in it;
//   - or it's a typo or two away from their name or one of its words ("jonh" finds "John");
//   - or it's exactly their email address, or their player id (from a friend link).
//
// Better matches come first.

// maxSearchCandidates bounds how many players one search looks through.
const maxSearchCandidates = 5000

// normalizeName folds s for matching: lower case, accents dropped, letters and digits only.
func normalizeName(s string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(strings.ToLower(s)) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// nameWords splits a name into normalized words.
func nameWords(s string) []string {
	var words []string
	for _, w := range strings.FieldsFunc(s, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r) && !unicode.Is(unicode.Mn, r)
	}) {
		if n := normalizeName(w); n != "" {
			words = append(words, n)
		}
	}
	return words
}

// typoAllowance is how many edits a query of n characters may be off by.
func typoAllowance(n int) int {
	switch {
	case n < 3:
		return 0
	case n < 6:
		return 1
	default:
		return 2
	}
}

// editDistance is how many single-character edits turn a into b — inserting, deleting or
// changing a letter, or swapping two neighbours (the commonest typo, "jonh") — by rune.
func editDistance(a, b string) int {
	ar, br := []rune(a), []rune(b)
	d := make([][]int, len(ar)+1)
	for i := range d {
		d[i] = make([]int, len(br)+1)
		d[i][0] = i
	}
	for j := range d[0] {
		d[0][j] = j
	}
	for i := 1; i <= len(ar); i++ {
		for j := 1; j <= len(br); j++ {
			cost := 1
			if ar[i-1] == br[j-1] {
				cost = 0
			}
			d[i][j] = min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost)
			if i > 1 && j > 1 && ar[i-1] == br[j-2] && ar[i-2] == br[j-1] {
				d[i][j] = min(d[i][j], d[i-2][j-2]+1)
			}
		}
	}
	return d[len(ar)][len(br)]
}

// nameScore is how well query matches a display name: 0 for not at all, higher for better.
func nameScore(displayName, query string) int {
	q := normalizeName(query)
	name := normalizeName(displayName)
	if q == "" || name == "" {
		return 0
	}
	switch {
	case name == q:
		return 100
	case strings.HasPrefix(name, q):
		return 80
	}
	words := nameWords(displayName)
	for _, w := range words {
		if strings.HasPrefix(w, q) {
			return 70
		}
	}
	if strings.Contains(name, q) {
		return 60
	}
	// Typos: against the whole name, each word, and the start of the name as long as the query.
	allowed := typoAllowance(len([]rune(q)))
	if allowed == 0 {
		return 0
	}
	best := allowed + 1
	targets := append([]string{name}, words...)
	if r := []rune(name); len(r) > len([]rune(q)) {
		targets = append(targets, string(r[:len([]rune(q))]))
	}
	for _, t := range targets {
		best = min(best, editDistance(q, t))
	}
	if best <= allowed {
		return 40 - 10*best
	}
	return 0
}

type searchCandidate struct {
	id, displayName, email string
}

// rankSearch picks the best matches for query among candidates, best first, at most limit.
func rankSearch(candidates []searchCandidate, query string, limit int) []string {
	type scored struct {
		id, name string
		score    int
	}
	var hits []scored
	exact := strings.ToLower(strings.TrimSpace(query))
	for _, c := range candidates {
		score := nameScore(c.displayName, query)
		if c.id == strings.TrimSpace(query) || (c.email != "" && strings.ToLower(c.email) == exact) {
			score = 110
		}
		if score > 0 {
			hits = append(hits, scored{c.id, strings.ToLower(c.displayName), score})
		}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].score != hits[j].score {
			return hits[i].score > hits[j].score
		}
		return hits[i].name < hits[j].name
	})
	ids := make([]string, 0, min(limit, len(hits)))
	for i := 0; i < len(hits) && i < limit; i++ {
		ids = append(ids, hits[i].id)
	}
	return ids
}
