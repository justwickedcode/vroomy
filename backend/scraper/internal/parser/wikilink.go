package parser

import "strings"

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
// Rejects:
//   - anything not starting with "/wiki/" — an interwiki citation link (e.g. Wikiquote linking
//     out to en.wikipedia.org for further reading, seen live with class="extiw") is a full
//     absolute URL to a different domain, not a relative path, so this alone excludes it
//     without needing to inspect the link's CSS class at all.
//   - any of wikiquoteExcludedNamespaces.
//   - a URL fragment (e.g. "/wiki/Aristotle#Politics") is stripped down to the page itself
//     ("/wiki/Aristotle") rather than rejected — the fragment just means "cites a
//     within-page section," but the same page is still exactly what we want to queue, and
//     leaving the fragment in would create a second, spurious URL for a page already known.
func resolveWikiquoteLink(wikiBase string, href string) (string, bool) {
	if !strings.HasPrefix(href, "/wiki/") {
		return "", false
	}
	if hash := strings.IndexByte(href, '#'); hash != -1 {
		href = href[:hash]
	}
	title := strings.TrimPrefix(href, "/wiki/")
	if title == "" {
		return "", false
	}
	for _, ns := range wikiquoteExcludedNamespaces {
		if strings.HasPrefix(title, ns) {
			return "", false
		}
	}
	return wikiBase + href, true
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
