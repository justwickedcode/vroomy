package parser

import (
	"os"
	"quotes-crawler/internal/models"
	"testing"
)

// TestWikiquoteParser_Parse also covers a real bug found live: this parser used to discard a
// non-English quote's nested citation *<ul>* wholesale, throwing away the real English
// translation Wikiquote had nested right alongside the citation itself (confirmed live on
// Sophocles and the Aeneid — see the doc comment above WikiquoteParser). The fixture's French
// and German quotes each now correctly yield *two* entries: the original-language text
// (unchanged from before, still there for a future non-English consumer, still filtered out by
// crawler.go's language checks for this "en" parser) and its English translation, extracted from
// the same nested <ul> the citation itself lives in.
func TestWikiquoteParser_Parse(t *testing.T) {
	expected := []models.Quote{
		{Text: "Everything should be made simple as possible but no simpler.", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "A happy man is too satisfied with the present to dwell too much on the future.", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "Un homme heureux est trop content du présent pour trop se soucier de l'avenir.", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "Blind obedience to authority is the greatest enemy of truth.", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "Autoritätsdusel ist der größte Feind der Wahrheit.", Author: "Albert Einstein", Source: "wikiquote-en"},
		{Text: "Dear Habicht, / Such a solemn air of silence has descended between us that I almost feel as if I am committing a sacrilege when I break it now with some inconsequential babble... / What are you up to, you frozen whale, you smoked, dried, canned piece of soul...?", Author: "Albert Einstein", Source: "wikiquote-en"},
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

// TestWikiquoteParser_Parse_ClassicalTranslation is a regression test for a real bug found
// live: a non-English original quote's English translation lives *inside the same nested
// citation <ul>* as the actual citation (confirmed on Sophocles and the Aeneid) — this parser
// used to discard that whole <ul> as pure citation, silently losing the translation along with
// it (the original-language text was still extracted, but then correctly rejected downstream by
// dedup.IsLatinScript/MatchesClaimedLanguage, so the net effect was 0 usable quotes from pages
// that structurally had plenty). Covers both a non-Latin-script original (Greek, needs
// IsLatinScript to catch) and a Latin-*language* original (needs MatchesClaimedLanguage
// specifically — Latin is written in the Latin alphabet, so IsLatinScript alone doesn't catch
// it, confirmed live this exact gap silently produced 0 recovered translations on the Aeneid
// page before MatchesClaimedLanguage was added to the check). Also verifies a citation line
// carrying the "Doc. " marker (Wikiquote's collected-papers citation convention, found live on
// Einstein's page) is correctly excluded, not kept as if it were quotable content.
func TestWikiquoteParser_Parse_ClassicalTranslation(t *testing.T) {
	html := `<html><body><h1 id="firstHeading"><span class="mw-page-title-main">Sophocles</span></h1>
<div id="mw-content-text"><div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2 id="Quotes">Quotes</h2></div>
<ul><li>οὔκουν γέλως ἥδιστος εἰς ἐχθροὺς γελᾶν;
<ul><li>And to mock at foes—is not that the sweetest mockery?</li>
<li>Line 79 (tr. R. C. Jebb, 1896)</li></ul></li></ul>
<ul><li>Tantae molis erat Romanam condere gentem!
<ul><li>So hard and huge a task it was to found the Roman people.</li>
<li>Book 1, line 33 (tr. Allen Mandelbaum)</li></ul></li></ul>
<ul><li>Everything should be made simple as possible but no simpler.
<ul><li>From "Mes Projets d'Avenir", a French essay written at age 18. Doc. 22.</li></ul></li></ul>
</div></div></body></html>`

	result, err := (&WikiquoteParser{}).Parse(html)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}

	var texts []string
	for _, q := range result.Quotes {
		texts = append(texts, q.Text)
	}

	mustContain := []string{
		"And to mock at foes—is not that the sweetest mockery?",
		"So hard and huge a task it was to found the Roman people.",
	}
	for _, want := range mustContain {
		found := false
		for _, got := range texts {
			if got == want {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("missing recovered translation %q in %v", want, texts)
		}
	}

	mustNotContain := []string{
		"Line 79 (tr. R. C. Jebb, 1896)",
		"Book 1, line 33 (tr. Allen Mandelbaum)",
		`From "Mes Projets d'Avenir", a French essay written at age 18. Doc. 22.`,
	}
	for _, unwanted := range mustNotContain {
		for _, got := range texts {
			if got == unwanted {
				t.Errorf("citation line kept as if it were a quote: %q", got)
			}
		}
	}
}
