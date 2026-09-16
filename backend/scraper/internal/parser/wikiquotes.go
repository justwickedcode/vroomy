package parser

import (
	"strings"

	"quotes-crawler/internal/dedup"
	"quotes-crawler/internal/models"

	"github.com/PuerkitoBio/goquery"
)

// englishWikiquoteBase is the site's own root URL for resolving citation links found within a
// quote — see resolveWikiquoteLink in wikilink.go.
const englishWikiquoteBase = "https://en.wikiquote.org"

// englishWikiquoteExcludedHeadingPrefixes — real bug found live: this parser used to require
// an *exact* "Quotes" heading match, which silently returned 0 quotes and 0 discovered URLs for
// any page using a different real heading instead (confirmed live: Fyodor Dostoyevsky's actual
// quotes section is titled "General", not "Quotes" — a legitimate, if less common, Wikiquote
// convention, not a malformed page). Switched to the same exclusion-list model already proven
// across German and the newer localized editions: every heading is quote-bearing except a known
// non-quote list, checked live across several author pages (Einstein, Tolstoy, Kafka, Voltaire,
// Dostoyevsky) before finalizing. "Attributed" is deliberately excluded too, matching this
// parser's previous behavior on every page that does have a "Quotes" heading (only that one
// heading was ever included before) — not a redesign of what counts as sourced enough, just
// extending the same standard to pages that name their bucket differently.
var englishWikiquoteExcludedHeadingPrefixes = []string{
	"Disputed", "Misattributed", "Attributed", "Quotes about", "See also", "External links",
	"References",
}

// nestedCitationMarkers are substrings found live marking a nested <li> as the citation itself
// rather than a real translation/commentary worth keeping — "(tr." is the standard
// translator-credit shape ("Line 79 (tr. R. C. Jebb, 1896)"); "Doc. " is Wikiquote's own
// document-number convention in citations sourced from published collected-papers volumes
// (confirmed live on Einstein's page: "From \"Mes Projets d'Avenir\" ... Doc. 22" and "Opening
// of a letter to his friend Conrad Habicht ... Doc. 27" — both purely descriptive citation
// prose, not anything quotable, that slipped through the narrower "(tr." check alone). Neither
// marker is a perfect, exhaustive test for every citation phrasing Wikiquote might use; a rare
// unmarked descriptive citation still occasionally gets kept as if it were a quote (an accepted,
// low-severity tradeoff — real English prose, just not literally something the subject said —
// for not needing to enumerate every citation convention this project's own corpus contains).
var nestedCitationMarkers = []string{"(tr.", "Doc. "}

// isNestedCitationLine reports whether text (already stripped of any further-nested quotation
// marks/whitespace) matches a known citation shape, rather than being real translation or
// commentary content worth keeping on its own — see nestedCitationMarkers.
func isNestedCitationLine(text string) bool {
	for _, marker := range nestedCitationMarkers {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}

// WikiquoteParser extracts quotes from a Wikiquote article page, e.g.
// https://en.wikiquote.org/wiki/Albert_Einstein. The page's own <h1> is used as the author,
// since per-author pages don't repeat the name on every line.
//
// A quote whose primary text is in its original, non-English language (confirmed live on
// Sophocles and the Aeneid — classical/translated-work pages) nests its English translation
// *inside the same citation <ul>* as the actual citation, e.g. "<li>[Greek original]<ul>
// <li>[English translation]</li><li>Line 79 (tr. R. C. Jebb, 1896)</li></ul></li>". This parser
// used to strip that whole nested <ul> as if it were pure citation, discarding the translation
// along with it — the primary (original-language) text was still extracted and saved, but then
// correctly rejected downstream by dedup.IsLatinScript for being non-English, so the net effect
// was the real, valuable English translation silently never made it into the corpus at all
// (confirmed live: Sophocles' real page yields 152 raw candidates, of which only 1 was
// Latin-script before this fix). Now, whenever the primary text isn't Latin-script, each nested
// <li> that doesn't itself look like a citation (see isNestedCitationLine) is extracted as
// its own additional quote by the same author — this also incidentally picks up real sourced
// commentary lines that aren't strictly "the" translation (e.g. a note on the line's fame), which
// is accepted as a reasonable, correctly-attributed bonus rather than something worth the added
// complexity of filtering out precisely.
//
// NextURLs comes only from citation links (see resolveWikiquoteLink) — a quote's citation is
// typically a nested <ul><li> (e.g. "<a href='/wiki/Aristotle'>Aristotle</a>, in <i>Politics</i>
// as translated by ...") naming the actual person being quoted, occasionally a co-cited person
// or the cited work. This is deliberately *not* "every link found on the page": Wikiquote
// article titles for the *primary* discovery mechanism still come from a separate MediaWiki
// category API (internal/crawler/wikiquote_discovery.go) — confirmed live that a page's
// outgoing links from the quote *body* text are mostly unrelated topical wikilinks (e.g. a
// thematic page's quote about "leadership" linking to "Independence" or "Democracy" mid-quote),
// the same problem an earlier, abandoned discovery approach (blind allpages enumeration) had at
// the whole-site scale. Citation links are a much narrower, higher-confidence signal than that.
type WikiquoteParser struct{}

func (p *WikiquoteParser) Parse(html string) (Result, error) {
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

	// Scoped to #mw-content-text, not a bare "div.mw-parser-output" — real bug found live: a
	// semi-protected page (e.g. Charles Darwin's, confirmed live) renders its protection-padlock
	// indicator through the *same* wikitext pipeline, producing a second, tiny, EMPTY
	// "mw-parser-output" div earlier in the DOM (inside "mw-indicators") than the real content
	// one. An unscoped .First() silently grabbed that empty div instead, so this page (and any
	// other semi-protected one — likely disproportionately the *more* popular authors, the ones
	// most worth having) returned 0 quotes and 0 discovered URLs with no error at all.
	// "#mw-content-text" is the real, unique content wrapper and never contains the indicator.
	doc.Find("#mw-content-text div.mw-parser-output").First().Children().Each(func(i int, s *goquery.Selection) {
		if s.HasClass("mw-heading2") {
			heading := strings.TrimSpace(s.Find("h2").Text())
			inQuotesSection = !hasAnyPrefix(heading, englishWikiquoteExcludedHeadingPrefixes)
			return
		}
		// Also matches <ol> — confirmed live (Buddha's page: a numbered list of "his last
		// sermon"'s eight main points) that a numbered list is exactly as valid a quote-bearing
		// list as a bulleted one; a bare "ul" check was silently dropping it.
		if !inQuotesSection || !s.Is("ul, ol") {
			return
		}

		s.ChildrenFiltered("li").Each(func(i int, li *goquery.Selection) {
			clone := li.Clone()
			citation := clone.Find("ul")
			citation.Find("a").Each(func(_ int, a *goquery.Selection) {
				if href, ok := a.Attr("href"); ok {
					if u, ok := resolveWikiquoteLink(englishWikiquoteBase, href); ok {
						result.NextURLs = append(result.NextURLs, u)
					}
				}
			})

			// Primary text with the citation block removed — computed before the non-Latin
			// check below, since that check needs to see the quote on its own, without the
			// citation's own (often Latin-script, e.g. a translator's name) text mixed in.
			withoutCitation := clone.Clone()
			withoutCitation.Find("ul").Remove()
			primaryText := dedup.StripQuoteChars(normalizeWhitespace(withoutCitation.Text()))

			// See the doc comment above: a non-English primary quote's nested citation block
			// commonly also contains its real English translation, sitting right alongside the
			// actual citation as a sibling <li> — extract every such sibling that doesn't
			// itself look like the citation, rather than discarding the whole block as pure
			// citation. Checks both IsLatinScript (Greek, Cyrillic, etc. — a different alphabet
			// entirely) and MatchesClaimedLanguage (Latin, French, German, etc. — confirmed
			// live on the Aeneid that Latin-*language* text is still Latin-*script*, so
			// IsLatinScript alone missed every Latin original on that page, extracting 0 of its
			// real English translations even though the exact same nested structure was there).
			if primaryText != "" && (!dedup.IsLatinScript(primaryText) || !dedup.MatchesClaimedLanguage(primaryText, "en")) {
				citation.First().ChildrenFiltered("li").Each(func(_ int, nested *goquery.Selection) {
					nestedClone := nested.Clone()
					nestedClone.Find("ul").Remove()
					nestedText := dedup.StripQuoteChars(normalizeWhitespace(nestedClone.Text()))
					if nestedText == "" || isNestedCitationLine(nestedText) {
						return
					}
					if !dedup.IsLatinScript(nestedText) || author == "" {
						return
					}
					result.Quotes = append(result.Quotes, models.Quote{
						Text:     nestedText,
						Author:   author,
						Source:   "wikiquote-en",
						Language: "en",
					})
				})
			}

			if primaryText == "" || author == "" {
				return
			}

			result.Quotes = append(result.Quotes, models.Quote{
				Text:     primaryText,
				Author:   author,
				Source:   "wikiquote-en",
				Language: "en",
			})
		})
	})

	result.NextURLs = dedupeStrings(result.NextURLs)
	return result, nil
}

func normalizeWhitespace(text string) string {
	return strings.Join(strings.Fields(text), " ")
}
