package parser

import "testing"

// TestGermanWikiquoteParser_PlainTrailingCitation is a regression test for a real bug found
// live on de.wikiquote.org/wiki/Deutsche_Sprichwörter: most citations on that page are wrapped
// in <i>, which the parser already strips, but some are plain trailing text with no wrapper at
// all — leaking the Swedish/Finnish publisher and ISBN straight onto an otherwise-correct
// German quote. See stripPlainTrailingCitation's doc comment in germanwikiquote.go.
func TestGermanWikiquoteParser_PlainTrailingCitation(t *testing.T) {
	html := `<html><body><h1 id="firstHeading"><span class="mw-page-title-main">Deutsche Sprichwörter</span></h1>
<div id="mw-content-text"><div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2 id="A">A</h2></div>
<ul>
<li>"Ein gutes <a href="/wiki/Gewissen">Gewissen</a> ist ein sanftes Ruhekissen." - Citatboken, Bokförlaget Natur och Kultur, Stockholm, 1967, <a href="/wiki/Spezial:ISBN-Suche/9127016811" class="internal mw-magiclink-isbn">ISBN 91-27-01681-1</a></li>
<li>"Einmal ist keinmal." Citatboken, Bokförlaget Natur och Kultur, Stockholm, 1967, <a href="/wiki/Spezial:ISBN-Suche/9127016811" class="internal mw-magiclink-isbn">ISBN 91-27-01681-1</a></li>
<li>"Alte Leute, alte Ränke - junge Füchse, neue Schwänke."</li>
<li>"Aller Anfang ist schwer." - <i><a href="/wiki/Wander-DSL">Wander-DSL</a>, Bd. 1, Sp. 80</i></li>
</ul>
</div></div></body></html>`

	result, err := (&GermanWikiquoteParser{}).Parse(html)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}

	want := []string{
		"Ein gutes Gewissen ist ein sanftes Ruhekissen.",
		"Einmal ist keinmal.",
		// No citation at all — the internal dash is real quote content and must survive.
		"Alte Leute, alte Ränke - junge Füchse, neue Schwänke.",
		"Aller Anfang ist schwer.",
	}
	if len(result.Quotes) != len(want) {
		t.Fatalf("got %d quotes, want %d: %+v", len(result.Quotes), len(want), result.Quotes)
	}
	for i, q := range result.Quotes {
		if q.Text != want[i] {
			t.Errorf("quote %d text = %q, want %q", i, q.Text, want[i])
		}
	}
}
