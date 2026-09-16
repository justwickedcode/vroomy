package main

import "strings"

// typingSafeReplacer normalizes punctuation that's common in real scraped quotes but awkward
// or impossible to type on a standard keyboard, so a typing-race game can require an exact
// character-for-character match without punishing the player for the source material's own
// typography. Checked live against the corpus before deciding this was worth doing: roughly a
// quarter of quotes in the typing-game-eligible length range contain an em dash, en dash, or
// curly quote. Deliberately narrow — only swaps punctuation for a plain-ASCII equivalent,
// preserving spacing exactly (an em dash inside a word like "wisdom—knowledge" stays exactly
// one character, not " - ", so word boundaries/positions aren't shifted) — not a general
// unicode-to-ASCII transliteration, which would also strip legitimate accented letters in
// names and borrowed words that are perfectly typeable, just with an extra keystroke or two.
var typingSafeReplacer = strings.NewReplacer(
	"—", "-", // em dash —
	"–", "-", // en dash –
	"‘", "'", // left single quote '
	"’", "'", // right single quote '
	"“", "\"", // left double quote "
	"”", "\"", // right double quote "
	"…", "...", // ellipsis …
	" ", " ", // non-breaking space
)

// MakeTypingSafe returns text with keyboard-unfriendly punctuation normalized to plain-ASCII
// equivalents, and any run of whitespace collapsed to a single space (defensive — the
// scraper's write path already produces single-spaced text, but this is what the typing race's
// exact-match input handling depends on, so it's worth guaranteeing here too rather than
// trusting an upstream service).
func MakeTypingSafe(text string) string {
	text = typingSafeReplacer.Replace(text)
	return strings.Join(strings.Fields(text), " ")
}
