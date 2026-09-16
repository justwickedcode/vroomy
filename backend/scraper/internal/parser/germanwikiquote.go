package parser

import (
	"regexp"
	"strings"
	"unicode/utf8"

	"quotes-crawler/internal/dedup"
	"quotes-crawler/internal/models"

	"github.com/PuerkitoBio/goquery"
)

// germanWikiquoteExcludedHeadingPrefixes are top-level h2 sections on a de.wikiquote.org
// biography page that are never quotes by the subject — checked as prefixes rather than
// exact matches because some include the article's own title (e.g. "Zitate mit Bezug auf
// Albert Einstein" — quotes ABOUT Einstein, not BY him).
//
// Unlike English Wikiquote, German biography pages don't consistently use one fixed heading
// name for the real quotes section — confirmed live across several pages: sometimes the
// article's own "Name (dates)" heading directly contains the quotes (e.g. Goethe), sometimes
// a second heading like "Überprüft" ("Verified") or "Zitate mit Quellenangabe" ("Quotes with
// sourcing") does instead (e.g. Twain, Einstein). Rather than guess the "right" heading name,
// every top-level section is treated as quote-bearing *except* this known exclusion list.
var germanWikiquoteExcludedHeadingPrefixes = []string{
	"Fälschlich zugeschrieben",
	"Zitate mit Bezug auf",
	"Weblinks",
	"Einzelnachweise",
	"Quellen",
	"Anmerkungen",
	"Siehe auch",
	"Literatur",
}

// germanTrailingCitation matches a trailing " - Source" / " – Source" / " — Source"
// separator left over after the citation <i> element itself has already been removed —
// German Wikiquote puts a quote's citation inline in the same <li> (dash-separated), unlike
// English Wikiquote's separate nested <ul>.
var germanTrailingCitation = regexp.MustCompile(`[\s]*[-–—][\s]*$`)

// germanCitationYear matches a plausible publication year (1600-2099) — used by
// stripPlainTrailingCitation as one of two signals that a trailing dash-separated segment is a
// citation, not quote content.
var germanCitationYear = regexp.MustCompile(`\b(?:1[6-9]|20)\d{2}\b`)

// stripPlainTrailingCitation handles a citation format found live on
// de.wikiquote.org/wiki/Deutsche_Sprichwörter that the <i>-based removal above misses entirely:
// some of that page's citations (e.g. "... - Citatboken, Bokförlaget Natur och Kultur,
// Stockholm, 1967, ISBN 91-27-01681-1") are plain trailing text with no <i> wrapper at all — as
// opposed to every other citation on the very same page, which does use <i> — so this parser
// was silently saving the Swedish publisher/ISBN straight onto an otherwise-correct German
// quote (confirmed live: 24 rows on this one page alone, e.g. "Ein gutes Gewissen ist ein
// sanftes Ruhekissen.\" - Citatboken, ..." saved verbatim, garbling real content and, as a side
// effect, tripping the language filter on the Swedish-looking tail).
//
// A citation's dash can't just be "the last dash in the text" — some genuine quotes use a dash
// as real internal punctuation, with the *actual* dash-less citation (a bare source name
// straight after the closing quote mark, no separator at all — confirmed live as its own
// distinct format on several German Wikiquote author pages) coming later still. Picking the
// dash unconditionally would truncate real quote content sitting between the two (confirmed
// live: "Gefühle sind ... Vernunft - sie verkörpern evolutionäre Rationalität." Yuval Noah
// Harari: ... ISBN ..." — the internal dash is mid-quote punctuation; the real citation starts
// only after the closing quote mark, well to the right of it). So both a dash-separator cut and
// a bare-closing-quote-mark cut are computed, each only counted as a candidate when its own
// tail looks like a citation (contains "ISBN" or a plausible publication year — a real quote's
// own text essentially never contains either), and whichever candidate keeps *more* text wins —
// erring toward preserving real content over aggressively stripping every trailing dash.
func stripPlainTrailingCitation(text string) string {
	best := -1

	for _, sep := range []string{" - ", " – ", " — "} {
		idx := strings.LastIndex(text, sep)
		if idx == -1 {
			continue
		}
		tail := text[idx+len(sep):]
		if (strings.Contains(tail, "ISBN") || germanCitationYear.MatchString(tail)) && idx > best {
			best = idx
		}
	}

	// A rarer variant drops the separator entirely (e.g. "\"Einmal ist keinmal.\" Citatboken,
	// ..." — straight from the closing quote mark to the citation, no dash at all). Falls back
	// to the last closing-quote-style character for these. Cuts *after* the full rune, not
	// idx+1 — several of these quote characters (e.g. „ “ « » ❝ ❞) are multi-byte in UTF-8, and
	// slicing mid-rune produces invalid UTF-8.
	if idx := strings.LastIndexAny(text, "\"“”«»❝❞"); idx != -1 {
		_, width := utf8.DecodeRuneInString(text[idx:])
		cut := idx + width
		tail := text[cut:]
		if (strings.Contains(tail, "ISBN") || germanCitationYear.MatchString(tail)) && cut > best {
			best = cut
		}
	}

	if best == -1 {
		return text
	}
	return strings.TrimSpace(text[:best])
}

// germanWikiquoteBase is the site's own root URL for resolving citation links found within a
// quote — see resolveWikiquoteLink in wikilink.go.
const germanWikiquoteBase = "https://de.wikiquote.org"

// GermanWikiquoteParser extracts quotes from a de.wikiquote.org biography page. Structurally
// different enough from English Wikiquote (inconsistent section heading naming, citations
// inline in the same <li> rather than in a nested <ul>, embedded "Original engl." source-
// language variants to strip) to warrant a separate implementation rather than parameterizing
// WikiquoteParser.
//
// NextURLs comes only from citation links (see resolveWikiquoteLink) — confirmed live on a
// real thematic page (de.wikiquote.org/wiki/Führer) that the citation names the actual author
// ("... - Volker Rühe, Konkret, Heft 2/1998", with "Volker Rühe" linked), a precise,
// high-confidence signal, deliberately not extended to links found in the quote body itself
// (that page's quotes also link to "Existenz," "Arbeit," "Demokratie" mid-quote — topical
// cross-references, not people, the same kind of noise an earlier discovery approach at this
// project abandoned allpages enumeration over).
type GermanWikiquoteParser struct{}

func (p *GermanWikiquoteParser) Parse(html string) (Result, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return Result{}, err
	}

	author := strings.TrimSpace(doc.Find("h1#firstHeading .mw-page-title-main").Text())
	if author == "" {
		author = strings.TrimSpace(doc.Find("h1#firstHeading").Text())
	}

	var result Result
	inQuotesSection := false

	// Scoped to #mw-content-text — see the identical comment in wikiquotes.go's Parse for why
	// an unscoped "div.mw-parser-output" selector silently returns 0 quotes on any
	// semi-protected page.
	doc.Find("#mw-content-text div.mw-parser-output").First().Children().Each(func(i int, s *goquery.Selection) {
		if s.HasClass("mw-heading2") {
			heading := strings.TrimSpace(s.Find("h2").Text())
			inQuotesSection = !hasAnyPrefix(heading, germanWikiquoteExcludedHeadingPrefixes)
			return
		}
		// Also matches <ol> — see the identical fix in wikiquotes.go (a numbered list is just
		// as valid a quote-bearing list as a bulleted one; a bare "ul" check silently drops it).
		if !inQuotesSection || !s.Is("ul, ol") {
			return
		}

		s.ChildrenFiltered("li").Each(func(i int, li *goquery.Selection) {
			clone := li.Clone()

			extractCitationLinks := func(sel *goquery.Selection) {
				sel.Find("a").Each(func(_ int, a *goquery.Selection) {
					if href, ok := a.Attr("href"); ok {
						if u, ok := resolveWikiquoteLink(germanWikiquoteBase, href); ok {
							result.NextURLs = append(result.NextURLs, u)
						}
					}
				})
			}

			// "Original engl."-style source-language variants and further nested sourcing
			// live in a <dl><dd><ul>...</ul></dd></dl> or a bare nested <ul> — both dropped,
			// but any citation-style links within them are worth the same treatment as the
			// main <i> citation below.
			sourcing := clone.Find("dl, ul")
			extractCitationLinks(sourcing)
			sourcing.Remove()

			// The inline citation is the last element child (an <i>), dash-separated from
			// the quote in the same text — not nested, so removing it leaves a trailing
			// dash behind that still needs stripping.
			if last := clone.Children().Last(); goquery.NodeName(last) == "i" {
				extractCitationLinks(last)
				last.Remove()
			}

			text := clone.Text()
			text = stripPlainTrailingCitation(text)
			text = germanTrailingCitation.ReplaceAllString(text, "")
			text = dedup.StripQuoteChars(normalizeWhitespace(text))
			if text == "" || author == "" {
				return
			}

			result.Quotes = append(result.Quotes, models.Quote{
				Text:     text,
				Author:   author,
				Source:   "wikiquote-de",
				Language: "de",
			})
		})
	})

	result.NextURLs = dedupeStrings(result.NextURLs)
	return result, nil
}

func hasAnyPrefix(s string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}
