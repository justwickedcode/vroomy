package parser

import (
	"strings"

	"github.com/PuerkitoBio/goquery"
)

// wikiquoteWalkChildren calls fn once for each element in children, in document order,
// transparently descending into any <section> wrapper instead of treating it as an opaque leaf.
//
// MediaWiki's current (Parsoid-based) rendering wraps each section's heading and body content in
// its own <section data-mw-section-id="N"> — e.g. <section ...><div class="mw-heading
// mw-heading2"><h2>Quotes</h2></div><ul>...real quotes...</ul></section> — one level deeper than
// the flat sibling structure every Wikiquote parser in this package (wikiquotes.go,
// germanwikiquote.go, wikiquote_i18n.go) was built against, where the heading div and its
// following <ul> were direct siblings of #mw-content-text div.mw-parser-output. A plain
// children.Each(fn) only ever sees the <section> elements themselves as direct children — never
// the heading/list elements nested inside them — so inQuotesSection never flips true and no <ul>
// is ever reached, on any page.
//
// Confirmed live as the actual root cause of a systemic "found 0 quotes on every page, every
// edition" regression (Sept 2026): direct-fetched a real, known-good page (Mark Twain's) and
// found its "Quotes" section — heading, images, and the real <ul><li> quote list all — wrapped
// inside a single <section aria-labelledby="Quotes">. Not any one parser's bug (all three use
// the identical children.Each(...) pattern), so fixed once, shared, rather than three times. A
// page still using the older, unwrapped flat structure (no <section> present at all — the
// existing unit test fixtures, and possibly some pages MediaWiki hasn't migrated) walks exactly
// as before; this only adds transparency for the wrapper when it's there.
func wikiquoteWalkChildren(children *goquery.Selection, fn func(*goquery.Selection)) {
	children.Each(func(_ int, s *goquery.Selection) {
		if goquery.NodeName(s) == "section" {
			wikiquoteWalkChildren(s.Children(), fn)
			return
		}
		fn(s)
	})
}

// wikiquoteExcludedNamespaces are non-content MediaWiki namespace prefixes — both English and
// German checked regardless of which edition is being parsed, since a namespace name from the
// wrong language never legitimately collides with a real article title, so checking both is
// only ever extra safety, never a false rejection. A link into one of these is a special/
// category/talk/etc. page, not a person or work page worth queueing.
var wikiquoteExcludedNamespaces = []string{
	"Special:", "Category:", "Wikiquote:", "Help:", "Talk:", "User:", "File:", "Template:", "Portal:",
	"Spezial:", "Kategorie:", "Hilfe:", "Diskussion:", "Benutzer:", "Datei:", "Vorlage:",
}

// resolveWikiquoteLink returns the absolute URL for href if it's a genuine same-wiki content
// link worth queueing as a discovery candidate, or ("", false) otherwise.
//
// Deliberately narrow to links found *within a quote's citation* (see wikiquotes.go /
// germanwikiquote.go — this is never called on links found in the quote body itself): a
// citation's link is almost always the quote's actual author, occasionally a co-cited person or
// the cited work — a precise, high-confidence signal. Confirmed live on a real page
// (de.wikiquote.org/wiki/Führer) that this is very different from topical links embedded in a
// quote's own text ("Existenz," "Arbeit," "Demokratie" — thematic cross-references, not people)
// and from an earlier attempt at this project (allpages enumeration) that blindly walked every
// article on the site and pulled in massive amounts of non-biographical junk as a result.
//
// Accepts two forms for a same-wiki link: the relative "/wiki/Foo" this function originally only
// handled, and the full absolute form MediaWiki's current (Parsoid-based) rendering now emits
// instead — "https://de.wikiquote.org/wiki/Foo" — confirmed live as a second real regression
// alongside the section-wrapping one: every citation link on every page was being rejected by
// the old relative-only check, including on this exact Führer page the doc comment above already
// cites as the original proof this mechanism worked (Volker Rühe's link is now
// "https://de.wikiquote.org/wiki/Volker_Rühe", not "/wiki/Volker_Rühe").
//
// Rejects:
//   - anything not matching wikiBase+"/wiki/" or a bare "/wiki/" prefix — an interwiki citation
//     link (e.g. Wikiquote linking out to en.wikipedia.org for further reading, seen live with
//     class="extiw") is a full absolute URL to a *different* host, so it matches neither prefix
//     without needing to inspect the link's CSS class at all.
//   - any of wikiquoteExcludedNamespaces.
//   - a "red link" — MediaWiki's own signal, in the URL itself ("?action=edit&redlink=1"), that
//     the cited page doesn't exist yet: a citation can link a real person's name even when that
//     person has no Wikiquote article of their own, and MediaWiki renders that link pointing at
//     an edit-this-page form instead of a real article. Found live: queueing these anyway meant
//     fetching a guaranteed-404 (e.g. "/wiki/Jacob_A._Riis?action=edit&redlink=1") and paying the
//     same stall/backoff penalty as a real failure, for a URL that already told us it was never
//     going to resolve to content.
//   - a URL fragment (e.g. "/wiki/Aristotle#Politics") is stripped down to the page itself
//     ("/wiki/Aristotle") rather than rejected — the fragment just means "cites a
//     within-page section," but the same page is still exactly what we want to queue, and
//     leaving the fragment in would create a second, spurious URL for a page already known.
func resolveWikiquoteLink(wikiBase string, href string) (string, bool) {
	if strings.Contains(href, "redlink=1") {
		return "", false
	}

	var relative string
	switch {
	case strings.HasPrefix(href, wikiBase+"/wiki/"):
		relative = strings.TrimPrefix(href, wikiBase)
	case strings.HasPrefix(href, "/wiki/"):
		relative = href
	default:
		return "", false
	}
	if hash := strings.IndexByte(relative, '#'); hash != -1 {
		relative = relative[:hash]
	}
	title := strings.TrimPrefix(relative, "/wiki/")
	if title == "" {
		return "", false
	}
	for _, ns := range wikiquoteExcludedNamespaces {
		if strings.HasPrefix(title, ns) {
			return "", false
		}
	}
	return wikiBase + relative, true
}

// dedupeStrings returns ss with duplicates removed, preserving first-seen order — used to keep
// a page's NextURLs from repeating the same cited author's URL once per quote that cites them.
func dedupeStrings(ss []string) []string {
	if len(ss) == 0 {
		return ss
	}
	seen := make(map[string]bool, len(ss))
	out := make([]string, 0, len(ss))
	for _, s := range ss {
		if seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}
