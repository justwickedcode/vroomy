package parser

import "testing"

// TestResolveWikiquoteLink covers both the relative "/wiki/Foo" form this function originally
// only accepted and the full absolute form ("https://de.wikiquote.org/wiki/Foo") MediaWiki's
// current (Parsoid-based) rendering now emits instead — a real regression found live on
// de.wikiquote.org/wiki/Führer, where every citation link (including Volker Rühe's) was being
// silently rejected because the old check only ever matched the relative form.
func TestResolveWikiquoteLink(t *testing.T) {
	const wikiBase = "https://de.wikiquote.org"

	cases := []struct {
		name    string
		href    string
		wantURL string
		wantOK  bool
	}{
		{"relative form (legacy)", "/wiki/Volker_Rühe", wikiBase + "/wiki/Volker_Rühe", true},
		{"absolute same-wiki form (current)", "https://de.wikiquote.org/wiki/Volker_Rühe", wikiBase + "/wiki/Volker_Rühe", true},
		{"absolute form with fragment stripped", "https://de.wikiquote.org/wiki/Aristoteles#Zitate", wikiBase + "/wiki/Aristoteles", true},
		{"relative form with fragment stripped", "/wiki/Aristoteles#Zitate", wikiBase + "/wiki/Aristoteles", true},
		{"interwiki link to a different host is rejected", "https://en.wikipedia.org/wiki/Volker_Rühe", "", false},
		{"absolute link to a different wikiquote edition is rejected", "https://en.wikiquote.org/wiki/Volker_Rühe", "", false},
		{"excluded namespace, relative form", "/wiki/Kategorie:Politiker", "", false},
		{"excluded namespace, absolute form", "https://de.wikiquote.org/wiki/Kategorie:Politiker", "", false},
		{"bare /wiki/ with nothing after it", "/wiki/", "", false},
		{"not a wiki link at all", "https://example.com/other", "", false},
		{"empty href", "", "", false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gotURL, gotOK := resolveWikiquoteLink(wikiBase, c.href)
			if gotOK != c.wantOK {
				t.Fatalf("resolveWikiquoteLink(%q) ok = %v, want %v", c.href, gotOK, c.wantOK)
			}
			if gotOK && gotURL != c.wantURL {
				t.Errorf("resolveWikiquoteLink(%q) = %q, want %q", c.href, gotURL, c.wantURL)
			}
		})
	}
}
