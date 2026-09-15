package parser

import (
	"os"
	"quotes-crawler/internal/models"
	"testing"
)

func TestWikiquoteParser_Parse(t *testing.T) {
	expected := []models.Quote{
		{Text: "Everything should be made simple as possible but no simpler.", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "Un homme heureux est trop content du présent pour trop se soucier de l'avenir.", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "Autoritätsdusel ist der größte Feind der Wahrheit.", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "Lieber Habicht! / Es herrscht ein weihevolles Stillschweigen zwischen uns, so daß es mir fast wie eine sündige Entweihung vorkommt, wenn ich es jetzt durch ein wenig bedeutsames Gepappel unterbreche... / Was machen Sie denn, Sie eingefrorener Walfisch, Sie getrocknetes, eingebüchstes Stück Seele...?", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "E=mc²", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "The mass of a body is a measure of its energy content.", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "We shall, therefore, assume the complete physical equivalence of a gravitational field and a corresponding acceleration of the reference system.", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "By a clock we understand anything characterized by a phenomenon passing periodically through identical phases so that we must assume, by the principle of sufficient reason, that all that happens in a given period is identical with all that happens in an arbitrary period.", Author: "Albert Einstein", Source: "wikiquote-en"},
	}

	data, err := os.ReadFile("testdata/wikiquote_albert_einstein.html")
	if err != nil {
		t.Fatalf("error reading file: %v", err)
	}

	result, err := (&WikiquoteParser{}).Parse(string(data))
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}

	if len(result.Quotes) != len(expected) {
		t.Fatalf("got %d quotes, want %d", len(result.Quotes), len(expected))
	}

	for i, quote := range result.Quotes {
		if quote.Text != expected[i].Text {
			t.Errorf("quote %d text = %q, want %q", i, quote.Text, expected[i].Text)
		}
		if quote.Author != expected[i].Author {
			t.Errorf("quote %d author = %q, want %q", i, quote.Author, expected[i].Author)
		}
		if quote.Source != expected[i].Source {
			t.Errorf("quote %d source = %q, want %q", i, quote.Source, expected[i].Source)
		}
	}

	// The fixture's terminating section is "Quotes about Einstein" — a plain top-level h2.
	// "Disputed"/"Misattributed" sections on the live page wrap their heading inside a
	// bordered template div rather than a plain sibling, which is why they're naturally
	// excluded without special-casing (see WikiquoteParser doc comment).
	//
	// Two of the fixture's quotes carry a nested <ul> citation naming a person/work — these
	// are the only NextURLs this parser produces (see resolveWikiquoteLink in wikilink.go).
	wantNext := []string{
		"https://en.wikiquote.org/wiki/Annus_Mirabilis_papers",
		"https://en.wikiquote.org/wiki/Julian_Barbour",
	}
	if len(result.NextURLs) != len(wantNext) {
		t.Fatalf("got NextURLs %v, want %v", result.NextURLs, wantNext)
	}
	for i, u := range result.NextURLs {
		if u != wantNext[i] {
			t.Errorf("NextURLs[%d] = %q, want %q", i, u, wantNext[i])
		}
	}
}

// TestWikiquoteParser_Parse_ExcludedSectionsOnly verifies a page with no real quotes section —
// only sections on the exclusion list — yields 0 quotes.
func TestWikiquoteParser_Parse_ExcludedSectionsOnly(t *testing.T) {
	html := `<html><body><h1 id="firstHeading"><span class="mw-page-title-main">Nobody</span></h1>
<div id="mw-content-text"><div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2 id="Disputed">Disputed</h2></div>
<ul><li>Not a real quote.</li></ul>
</div></div></body></html>`

	result, err := (&WikiquoteParser{}).Parse(html)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}
	if len(result.Quotes) != 0 {
		t.Errorf("got %d quotes, want 0 when every heading is on the exclusion list", len(result.Quotes))
	}
}

// TestWikiquoteParser_Parse_NonStandardHeading is a regression test for a real bug found live:
// this parser used to require the heading to be *exactly* "Quotes", so a page using a real but
// different heading name silently yielded 0 quotes and 0 discovered URLs — confirmed live on
// https://en.wikiquote.org/wiki/Fyodor_Dostoyevsky, whose actual quotes section is titled
// "General". Any heading not on the exclusion list is now treated as quote-bearing.
func TestWikiquoteParser_Parse_NonStandardHeading(t *testing.T) {
	html := `<html><body><h1 id="firstHeading"><span class="mw-page-title-main">Somebody</span></h1>
<div id="mw-content-text"><div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2 id="General">General</h2></div>
<ul><li>A real quote under a non-standard heading name.</li></ul>
<div class="mw-heading mw-heading2"><h2 id="Quotes_about_Somebody">Quotes about Somebody</h2></div>
<ul><li>Not by them — should still be excluded.</li></ul>
</div></div></body></html>`

	result, err := (&WikiquoteParser{}).Parse(html)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}
	if len(result.Quotes) != 1 {
		t.Fatalf("got %d quotes, want 1: %+v", len(result.Quotes), result.Quotes)
	}
	if result.Quotes[0].Text != "A real quote under a non-standard heading name." {
		t.Errorf("text = %q", result.Quotes[0].Text)
	}
}
