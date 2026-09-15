package dedup

import (
	"sync"

	"github.com/pemistahl/lingua-go"
)

// minLengthForLanguageCheck: below this, statistical language detection is unreliable — checked
// live against the real corpus (60 genuine short English quotes, 8-40 chars) before picking this
// number, not guessed. Confidence scores for indisputably-correct short English were noisy
// enough (as low as 0.04-0.09 for real quotes like "War is war." or "Excelsior!") to risk
// wrongly rejecting them at any threshold that would also catch real leaks. Below this length,
// IsLatinScript and MinQuoteLength are what's actually doing the filtering work — this check
// only adds value once there's enough text for the statistics to mean something.
const minLengthForLanguageCheck = 30

// languageConfidenceThreshold: calibrated against a full-corpus audit, not guessed, and revised
// once already after that audit surfaced a real false positive. Real mislabeled content (French,
// Portuguese, Latin, Romanian, Turkish, Italian, Spanish, German quotes all tagged language="en")
// scored 0.0000-0.0196 in confidence for their claimed language; genuine English/German scored
// 0.5+ in almost every case, with one confirmed exception — "I'm not a feminist, I'm a humanist."
// (36 chars, real Madonna quote) scored 0.0415, apparently just short and punctuation-heavy
// enough to confuse the statistics. 0.025 sits at the midpoint between the highest confirmed
// true leak (0.0196) and that one confirmed false positive (0.0415) — a real, if imperfect,
// margin on both sides, not a guess. A short colloquial sentence near this boundary can still
// occasionally slip through the intended reject; that's an accepted tradeoff, the same way
// IsTooShort/MinQuoteLength accept "E=mc²" being cut to avoid a worse alternative.
const languageConfidenceThreshold = 0.025

// topLanguageConfidenceFloor / topLanguageDominanceRatio: a second, comparative check added
// after the user reported real French quotes still slipping through tagged language="en" —
// confirmed live these are genuine, current leaks, not stale pre-fix rows (e.g. "le mystère de
// l'amour est plus grand que le mystère de la mort." — Oscar Wilde, saved the same day this was
// investigated). The absolute floor above can't catch this class of leak: a fully French
// sentence can still score *above* 0.025 for "en" (0.03-0.18, confirmed on several real leaked
// rows) while French itself scores 0.58-0.91 — decisively the real language, just not low
// enough in its wrong-language score to trip a single absolute cutoff.
//
// Reject when some other language is both itself confidently detected (>= 0.4) and beats the
// claimed language by at least 3x its confidence. Calibrated against ~5,000 real corpus quotes
// (a random sample of everything currently tagged "en"/"de", not a handful of examples) rather
// than guessed: this exact rule caught the reported French leaks and their siblings, while
// producing only one new false reject across the whole sample (a genuine German idiom,
// "Je später der Abend, je netter/schöner die Gäste.", misdetected as Swedish at high
// confidence — an accepted rare tradeoff for closing an otherwise invisible contamination
// gap). Confirmed it doesn't regress the one previously-known false positive at the absolute
// floor ("I'm not a feminist, I'm a humanist." — en 0.0415, next-best Latin 0.0983, only a
// 2.4x gap, under the 3x floor here) or reject short/ambiguous genuine English whose nearest
// alternative language never separately clears the 0.4 confidence floor (e.g. "A man of logic
// is a man of sin." — Latin 0.08 vs en 0.077, both far below 0.4).
const (
	topLanguageConfidenceFloor = 0.4
	topLanguageDominanceRatio  = 3.0
)

// languageByCode maps models.Quote.Language values to lingua's Language enum. Add an entry here
// if a new source language is ever added (see internal/crawler/wikiquote_discovery.go's
// wikiquoteSite.language) — an unmapped code makes MatchesClaimedLanguage skip the check
// entirely (fail open) rather than reject everything from a language it doesn't recognize.
var languageByCode = map[string]lingua.Language{
	"en": lingua.English,
	"de": lingua.German,
	"fr": lingua.French,
	"es": lingua.Spanish,
	"it": lingua.Italian,
	"pt": lingua.Portuguese,
	"pl": lingua.Polish,
	"sv": lingua.Swedish,
	"ro": lingua.Romanian,
	"cs": lingua.Czech,
	"hu": lingua.Hungarian,
	"da": lingua.Danish,
	"no": lingua.Bokmal, // no.wikiquote.org is the Bokmål-standard edition
	"fi": lingua.Finnish,
}

var (
	detector     lingua.LanguageDetector
	detectorOnce sync.Once
)

// WarmLanguageDetector builds the language detector once. Deliberately called explicitly at
// crawler startup (see Crawler.Run, alongside WarmSimhashCache) rather than left to lazily
// build on the first quote — loading language models from disk takes a little over a second,
// and that cost is much easier to account for as one visible, logged startup step than as an
// unexplained pause attributed to whatever the first real quote happened to be.
//
// FromAllLanguagesWithLatinScript, not FromAllLanguages: found live, testing a real
// containerized deployment and hitting an OOM kill, that the full 75-language model set uses
// ~1GB of resident memory — far more than a small background crawler should need. Every call
// to MatchesClaimedLanguage only ever runs on text that has *already* passed IsLatinScript, so
// loading Arabic/Cyrillic/CJK/Devanagari/etc. language models is pure waste — restricting to
// Latin-script languages only cut memory to ~330MB with zero accuracy change on every known
// regression case (re-verified directly before switching, not assumed).
func WarmLanguageDetector() {
	detectorOnce.Do(func() {
		detector = lingua.NewLanguageDetectorBuilder().FromAllLanguagesWithLatinScript().Build()
	})
}

// MatchesClaimedLanguage reports whether text is plausibly written in language (a
// models.Quote.Language code, e.g. "en"/"de") — a real language check, not just a script check
// like IsLatinScript. Added after finding, live, a real and fairly large vein of contamination
// IsLatinScript structurally cannot catch: Latin, Portuguese, and Romanian quotes (Quintilian,
// Seneca, Jordanes, Fernando Pessoa, Marin Sorescu among the confirmed examples) all use the
// Latin *script*, so they sailed straight through a script-only filter despite being tagged
// language="en" — IsLatinScript was only ever built to catch non-Latin scripts (Arabic,
// Cyrillic, CJK), not to verify the claimed language is actually correct.
//
// Returns true (i.e. "don't reject") for text under minLengthForLanguageCheck, or for an
// unrecognized language code — this check only adds value where the statistics are reliable
// and only for languages it has an actual mapping for; it's not a replacement for
// IsLatinScript/IsTooShort, which still cover the short/script cases this deliberately leaves
// alone.
func MatchesClaimedLanguage(text string, language string) bool {
	if len(text) < minLengthForLanguageCheck {
		return true
	}
	want, ok := languageByCode[language]
	if !ok {
		return true
	}

	WarmLanguageDetector()
	confidences := detector.ComputeLanguageConfidenceValues(text)
	if len(confidences) == 0 {
		return true
	}

	var claimedConfidence float64
	for _, c := range confidences {
		if c.Language() == want {
			claimedConfidence = c.Value()
			break
		}
	}
	if claimedConfidence < languageConfidenceThreshold {
		return false
	}

	// confidences is sorted descending (see lingua-go's confidenceValueSlice), so index 0 is
	// always the single best-matching language for this text.
	topConfidence := confidences[0].Value()
	if topConfidence >= topLanguageConfidenceFloor && topConfidence >= topLanguageDominanceRatio*claimedConfidence {
		return false
	}
	return true
}
