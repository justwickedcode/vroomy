package dedup

import (
	"crypto/sha256"
	"fmt"
	"hash/fnv"
	"io"
	"math/bits"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	NumBands               = 4
	BandBits               = 16
	HammingThreshold       = 3
	bandMask         int64 = (1 << BandBits) - 1
)

var whitespaceRegex = regexp.MustCompile(`\s+`)

func StripQuoteChars(text string) string {
	return strings.Trim(text, "\"\u201c\u201d«»❝❞")
}

func Normalize(text string) string {
	text = strings.TrimSpace(text)
	text = StripQuoteChars(text)
	text = whitespaceRegex.ReplaceAllString(text, " ")
	text = strings.ToLower(text)
	return text
}

// nonLatinTolerance is the maximum share of letter runes allowed to be non-Latin before
// IsLatinScript rejects the text. Not zero: a single stray non-Latin character is often a
// homoglyph typo in the source (e.g. Greek "Η" used for Latin "H") rather than an actually
// non-English quote — seen for real on Wikiquote's Plato page, where an otherwise fully
// English quote (300+ letters) had exactly one Greek Eta at the start. A whole-quote reject
// on any single non-Latin letter was too strict; a ratio distinguishes "one stray character"
// from "this quote is actually written in another script."
const nonLatinTolerance = 0.10

// IsLatinScript reports whether text is predominantly Latin-script. It allows accented Latin
// letters (café, naïve) — it's a script gate, not an ASCII-only check — and tolerates a small
// fraction of non-Latin letters (see nonLatinTolerance), but rejects text substantially
// written in Arabic, Cyrillic, CJK, Greek, etc.
func IsLatinScript(text string) bool {
	var total, nonLatin int
	for _, r := range text {
		if unicode.IsLetter(r) {
			total++
			if !unicode.Is(unicode.Latin, r) {
				nonLatin++
			}
		}
	}
	if total == 0 {
		return true
	}
	return float64(nonLatin)/float64(total) <= nonLatinTolerance
}

// MinQuoteLength is the shortest a quote's text may be, in runes, before IsTooShort rejects
// it. Calibrated the same way as MaxQuoteLength — checked against the live corpus rather than
// picked round: every quote under 8 characters found live was a citation/page-reference
// fragment that leaked through as if it were a standalone quote ("Ch.8", "p. 78", "p. 280",
// a bare "[7]" footnote marker) — likely a parser picking up a citation element as its own
// list item. Every quote at 8 characters or longer found live was a genuine, if terse, quote
// ("Be brave", "Who Am I?"). One accepted edge case: "E=mc²" (5 chars) is a real, famous line
// but reads more like a formula than a quotable sentence — cut along with the citation
// fragments rather than special-cased, since carving out one 5-character exception isn't worth
// the added complexity for a single quote.
const MinQuoteLength = 8

// IsTooShort reports whether text is under MinQuoteLength.
func IsTooShort(text string) bool {
	return utf8.RuneCountInString(text) < MinQuoteLength
}

// dictionaryEntryRegex matches a short headword (optionally with a German article) immediately
// followed by a bracketed, abbreviated part-of-speech tag ending in a period — e.g. "Zukunft,
// die [Subst.], jene Zeit..." or "Eifersüchtig, [Adj.], Unnötig besorgt...". Found live on
// German Wikiquote's Ambrose Bierce page: real, correctly-attributed quotes from his "Devil's
// Dictionary," which is *written* as a satirical dictionary — genuine content, just shaped
// like a reference-book entry rather than something quotable in a game.
//
// Deliberately narrow (the bracket must appear within the first 25 characters, and contain a
// short Title-Case abbreviation ending in a period) rather than "contains any bracket at all":
// scholarly/translated quotes very commonly use brackets for editorial insertions (e.g. "[T]he
// ancient philosophers...", "the vicious portion of [our] population") — 1,258 quotes in the
// live corpus contain a bracket somewhere, and a blanket bracket-reject would have wrongly
// thrown out nearly all of them. This pattern was checked against the full corpus before
// landing on this shape: it matches exactly the 14 known dictionary-style entries, with zero
// false positives among the other 1,244 bracket-containing quotes.
var dictionaryEntryRegex = regexp.MustCompile(`^.{0,25}\[\p{Lu}\p{Ll}{1,9}\.\]`)

// LooksLikeDictionaryEntry reports whether text is shaped like a dictionary/reference-book
// entry (headword + part-of-speech tag + definition) rather than a quotable line.
func LooksLikeDictionaryEntry(text string) bool {
	return dictionaryEntryRegex.MatchString(text)
}

// wikiSignatureRegex matches a MediaWiki auto-signature timestamp (from a ~~~~ expansion) —
// e.g. "00:35, 12 June 2025 (UTC)" or "23:59, 19 August 2025 (GST)". Found live on Wikiquote's
// "June 20"-style calendar pages: these are "quote of the day" *nomination/voting* pages, not
// biography pages — real editors discussing and voting on candidate quotes ("3 Kalki (talk ·
// contributions) 12:04, 17 June 2010 (UTC) with a strong lean toward 4."), which the generalized
// exclusion-list parser (see LocalizedWikiquoteParser / WikiquoteParser's "any heading is
// quote-bearing unless excluded" model) now sweeps in as if they were real quotes, with the
// page's calendar-date title ("June 20") saved as a nonsensical "author". The timezone
// abbreviation is deliberately not hardcoded to "UTC" — a real corpus row used "(GST)" — since a
// real quote's own text essentially never contains this "time, date (TZ)" shape regardless of
// which abbreviation appears. wikiTalkLinkRegex catches a second, timestamp-less variant of the
// same contamination: an unsigned comment's "(talk · contribs)"-style wiki link suffix.
//
// Deliberately content-shaped, not page-title-shaped ("reject anything from a calendar-date
// page") — confirmed live that the same calendar pages also carry real, legitimately-featured
// quotes (e.g. genuine Mitch Hedberg quotes on "February 24") mixed in with the discussion noise,
// so rejecting by page origin would have thrown out good content along with the bad.
var (
	wikiSignatureRegex = regexp.MustCompile(`\d{1,2}:\d{2}, \d{1,2} \p{L}+ \d{4} \([A-Z]{2,5}\)`)
	wikiTalkLinkRegex  = regexp.MustCompile(`\(talk\s*[·•/]\s*(contribs|contributions|e-mail)\)`)
)

// LooksLikeWikiDiscussion reports whether text is discussion/voting/signature content that
// leaked through as if it were a quote, rather than a real quotable line.
func LooksLikeWikiDiscussion(text string) bool {
	return wikiSignatureRegex.MatchString(text) || wikiTalkLinkRegex.MatchString(text)
}

// MinGameWordCount is the fewest words a quote may have before GameSuitability flags it as
// too_short for a typing race specifically — distinct from MinQuoteLength (a character-count
// floor applied at ingest to reject citation fragments outright). Calibrated against the live
// corpus: 37,740 of ~750K rows fall under this threshold — single names, date ranges, and
// citation fragments too short to make a meaningful typing passage even though they pass
// MinQuoteLength's character-count floor.
const MinGameWordCount = 5

// longBracketContentRegex matches a bracket pair whose content exceeds ~70 characters. Originally
// calibrated at 21 from one confirmed-bad ~110-character stage-direction example
// ("[il criminale Flowers, inseguito dal detective, si nasconde sotto un'automobile...]"), but a
// full dry-run backfill pass over the live corpus (see cmd/backfill) surfaced real false
// positives at that threshold — genuine, legitimate editorial clarifications like
// "[all things being equal]" (23 chars) and "[seeking scientific knowledge or explanation of
// fact]" (52 chars), both plain Aristotle-translation insertions, not markup leakage. Raised to
// sit comfortably above both confirmed-legitimate examples and still well below the
// confirmed-bad one — deliberately not "any bracket" at all: 43,812 quotes in the live corpus
// contain one, and the vast majority are the short, legitimate kind (see
// LooksLikeDictionaryEntry's own comment on the same finding).
var longBracketContentRegex = regexp.MustCompile(`\[[^\[\]]{71,}\]`)

// bracketedEllipsisRegex matches "[...]" or "[…]" — an editorial mark for omitted text, meaning
// the quote is a fragment with a gap in it, found live to be common and unambiguous.
var bracketedEllipsisRegex = regexp.MustCompile(`\[\s*(\.\.\.|…)\s*\]`)

// urlRegex matches an embedded URL — found live to always be citation/reference leakage (a
// footnote link, a source URL) rather than something a real quote would ever contain.
var urlRegex = regexp.MustCompile(`https?://|www\.`)

// numericOnlyRegex matches text made up of nothing but digits and date/range punctuation — found
// live on a handful of rows (e.g. "1932-1934", "8.12.14.") that are clearly a citation date
// captured as if it were the quote's own text, not real quotable content. Rare (6 rows in the
// live corpus) but unambiguous.
var numericOnlyRegex = regexp.MustCompile(`^[0-9\s.,\-]+$`)

// tightAsteriskEmphasisRegex matches a "*word*"-shaped pair — asterisk, word characters, asterisk,
// with nothing in between — the one legitimate-looking asterisk usage (markdown-style emphasis).
// hasLeakedAsterisk strips every such pair out first, then checks whether any asterisk remains;
// what's left after that is reliably a footnote marker ("...misstep.*", "place* of") or a
// typographic section-break run ("* * * * *") rather than emphasis — a real bug found writing
// this function's own test: a naive "asterisk adjacent to whitespace" check can't tell "*word*"
// apart from either bad case, since a real emphasis pair is *also* whitespace-bounded on its
// outside edges by definition (it's a separate token from the words around it).
var tightAsteriskEmphasisRegex = regexp.MustCompile(`\*\w+\*`)

func hasLeakedAsterisk(text string) bool {
	return strings.Contains(tightAsteriskEmphasisRegex.ReplaceAllString(text, ""), "*")
}

// unwritableCharAllowlist are runes that fall into a Unicode category GameSuitability otherwise
// treats as unwritable (Cc/Cf/Co/Cs/So — control, format, private-use, surrogate, other-symbol:
// covers emoji, dingbats, zero-width joiners, directional marks) but are common enough in real
// quotes to allow explicitly, rather than reject. Not exhaustive by design — meant to be extended
// from real false positives found via the backfill tool's --dry-run sampling (see cmd/backfill),
// the same live-evidence method used to calibrate every other rule in this file, rather than
// guessed exhaustively up front.
var unwritableCharAllowlist = map[rune]bool{
	'°': true,                       // degree sign — temperatures, angles, common in real quotes
	'©': true, '®': true, '™': true, // legal/trademark marks, occasionally quoted verbatim
	'†': true, '‡': true, // dagger/double-dagger — historical footnote convention, not a citation leak itself
	'§': true, '¶': true, // section/pilcrow — legal and literary text sometimes quotes these directly
}

// isUnwritableRune reports whether r falls into a Unicode category GameSuitability treats as
// not reasonably typeable on a standard keyboard (control/format/private-use/surrogate/other-
// symbol — covers emoji, dingbats, box-drawing, directional marks), unless explicitly allowed.
func isUnwritableRune(r rune) bool {
	if unwritableCharAllowlist[r] {
		return false
	}
	return unicode.In(r, unicode.Cc, unicode.Cf, unicode.Co, unicode.Cs, unicode.So)
}

// GameSuitability reports whether text is real, correctly-sourced content that isn't a good fit
// for a typing-race game specifically — too short, or containing markup/characters that leaked
// through extraction rather than being part of the actual quote. Every rule here is calibrated
// against the live corpus (see PRODUCTION.md / the commit introducing this function for the full
// evidence), not guessed: deliberately does NOT flag brackets in general, ALL-CAPS text, or
// repeated ellipsis dots — all checked live and found to be dominated by genuine, legitimate
// content, unlike the narrower patterns actually used below. reasons is empty (not nil) when
// unsuitable is false, ordered deterministically (checks always run in the same order) so a
// backfill re-run produces byte-identical output for byte-identical input.
func GameSuitability(text string) (unsuitable bool, reasons []string) {
	reasons = []string{}

	if len(strings.Fields(text)) < MinGameWordCount {
		reasons = append(reasons, "too_short")
	}

	leakedMarkup := strings.ContainsAny(text, "{~") ||
		strings.Contains(text, "[[") || strings.Contains(text, "]]") ||
		longBracketContentRegex.MatchString(text) ||
		bracketedEllipsisRegex.MatchString(text) ||
		urlRegex.MatchString(text) ||
		numericOnlyRegex.MatchString(strings.TrimSpace(text)) ||
		hasLeakedAsterisk(text)
	if leakedMarkup {
		reasons = append(reasons, "leaked_markup")
	}

	for _, r := range text {
		if isUnwritableRune(r) {
			reasons = append(reasons, "unwritable_characters")
			break
		}
	}

	return len(reasons) > 0, reasons
}

func SHA256(text string) string {
	return fmt.Sprintf("%x", sha256.Sum256([]byte(text)))
}

func Simhash(text string) int64 {
	words := strings.Fields(text)
	var counter [64]int64

	h := fnv.New64a()
	for _, word := range words {
		h.Reset()
		if _, err := io.WriteString(h, word); err != nil {
			return 0
		}
		hash := h.Sum64()
		for bit := 0; bit < 64; bit++ {
			if (hash>>bit)&1 == 1 {
				counter[bit]++
			} else {
				counter[bit]--
			}
		}
	}

	var fingerprint int64
	for bit := 0; bit < 64; bit++ {
		if counter[bit] > 0 {
			fingerprint |= 1 << bit
		}
	}
	return fingerprint
}

func ExtractBands(simhash int64) [NumBands]int64 {
	var bands [NumBands]int64
	for i := 0; i < NumBands; i++ {
		bands[i] = (simhash >> (i * BandBits)) & bandMask
	}
	return bands
}

func HammingDistance(a, b int64) int {
	return bits.OnesCount64(uint64(a ^ b))
}
