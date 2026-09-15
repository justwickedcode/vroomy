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

// WikiquoteParser extracts quotes from a Wikiquote article page, e.g.
// https://en.wikiquote.org/wiki/Albert_Einstein. The page's own <h1> is used as the author,
// since per-author pages don't repeat the name on every line.
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
			citation.Remove()

			text := dedup.StripQuoteChars(normalizeWhitespace(clone.Text()))
			if text == "" || author == "" {
				return
			}

			result.Quotes = append(result.Quotes, models.Quote{
				Text:     text,
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
