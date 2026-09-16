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
