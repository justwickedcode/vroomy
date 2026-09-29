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
		// Real bug found live: a citation naming someone with no Wikiquote article of their own
		// renders as a "red link" pointing at an edit-this-page form, not a real article —
		// queueing it anyway meant fetching a guaranteed 404 and paying the stall/backoff penalty
		// for a URL that already announced it wasn't going to resolve to content.
		{"red link (nonexistent page) is rejected, relative form", "/wiki/Jacob_A._Riis?action=edit&redlink=1", "", false},
		{"red link (nonexistent page) is rejected, absolute form", "https://de.wikiquote.org/wiki/Jacob_A._Riis?action=edit&redlink=1", "", false},
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
