package parser

import "testing"

// TestLocalizedWikiquoteParser_French verifies quotes nested a level deeper (h3 under a top
// "Citations" h2 bucket) are still picked up, and an excluded heading (quotes *about* the
// subject) is skipped — matching the real structure confirmed live on fr.wikiquote.org.
func TestLocalizedWikiquoteParser_French(t *testing.T) {
	html := `<html><body><h1 id="firstHeading"><span class="mw-page-title-main">Albert Einstein</span></h1>
<div id="mw-content-text"><div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2 id="Citations">Citations</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Physique">Physique</h3></div>
<ul><li>Dieu ne joue pas aux dés.</li></ul>
<div class="mw-heading mw-heading2"><h2 id="Citations_sur_Albert_Einstein">Citations sur Albert Einstein</h2></div>
<ul><li>Einstein était un génie.</li></ul>
</div></div></body></html>`

	p := &LocalizedWikiquoteParser{
		Source:                  "wikiquote-fr",
		Language:                "fr",
		ExcludedHeadingPrefixes: []string{"Citations sur"},
	}
	result, err := p.Parse(html)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}
	if len(result.Quotes) != 1 {
		t.Fatalf("got %d quotes, want 1: %+v", len(result.Quotes), result.Quotes)
	}
	if result.Quotes[0].Text != "Dieu ne joue pas aux dés." {
		t.Errorf("text = %q, want %q", result.Quotes[0].Text, "Dieu ne joue pas aux dés.")
	}
	if result.Quotes[0].Language != "fr" || result.Quotes[0].Source != "wikiquote-fr" {
		t.Errorf("got language=%q source=%q", result.Quotes[0].Language, result.Quotes[0].Source)
	}
}

// TestLocalizedWikiquoteParser_PolishNestedCitation verifies a nested <ul> citation/see-also
// block inside the <li> (the Polish structure) is stripped rather than leaking into the quote.
func TestLocalizedWikiquoteParser_PolishNestedCitation(t *testing.T) {
	html := `<html><body><h1 id="firstHeading"><span class="mw-page-title-main">Albert Einstein</span></h1>
<div id="mw-content-text"><div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2 id="A">A</h2></div>
<ul><li>Bo ja wolno myslę.
<ul><li>Zobacz też: myślenie</li></ul></li></ul>
</div></div></body></html>`

	p := &LocalizedWikiquoteParser{Source: "wikiquote-pl", Language: "pl"}
	result, err := p.Parse(html)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}
	if len(result.Quotes) != 1 {
		t.Fatalf("got %d quotes, want 1: %+v", len(result.Quotes), result.Quotes)
	}
	if result.Quotes[0].Text != "Bo ja wolno myslę." {
		t.Errorf("text = %q, want %q (nested citation should be stripped)", result.Quotes[0].Text, "Bo ja wolno myslę.")
	}
}

// TestLocalizedWikiquoteParser_SpanishFootnote verifies a numbered footnote marker
// (<sup class="reference">) is stripped rather than leaking "[1]" into the quote text.
func TestLocalizedWikiquoteParser_SpanishFootnote(t *testing.T) {
	html := `<html><body><h1 id="firstHeading"><span class="mw-page-title-main">Albert Einstein</span></h1>
<div id="mw-content-text"><div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2 id="Citas">Citas</h2></div>
<div class="mw-heading mw-heading3"><h3 id="A">A</h3></div>
<ul><li>Al principio todos los pensamientos pertenecen al amor.<sup id="cite_ref-1" class="reference"><a href="#cite_note-1">1</a></sup></li></ul>
</div></div></body></html>`

	p := &LocalizedWikiquoteParser{Source: "wikiquote-es", Language: "es"}
	result, err := p.Parse(html)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}
	if len(result.Quotes) != 1 {
		t.Fatalf("got %d quotes, want 1: %+v", len(result.Quotes), result.Quotes)
	}
	if result.Quotes[0].Text != "Al principio todos los pensamientos pertenecen al amor." {
		t.Errorf("text = %q, footnote marker should be stripped", result.Quotes[0].Text)
	}
}

// TestLocalizedWikiquoteParser_FrenchBareCitationDiv is a regression test for a real bug found
// live on fr.wikiquote.org/wiki/Socrate: roughly half that page's quotes are a bare sibling
// <div class="citation"> — not inside any <ul>/<ol> at all — immediately followed by <ul> blocks
// holding only a <span class="precisions"> annotation and a <div class="ref"> citation. This
// parser used to miss the real quote entirely (it only ever looked inside <ul>/<ol> for <li>
// text) while saving the "precisions" annotation as if it were the quote.
func TestLocalizedWikiquoteParser_FrenchBareCitationDiv(t *testing.T) {
	html := `<html><body><h1 id="firstHeading"><span class="mw-page-title-main">Socrate</span></h1>
<div id="mw-content-text"><div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2 id="Citations">Citations</h2></div>
<div class="citation">Je ne sais qu'une chose, c'est que je ne sais rien.</div>
<ul><li><span class="precisions">Apologie de Socrate, 21d. Socrate vérifie l'oracle de Delphes.</span></li></ul>
<ul><li><div class="ref">Apologie de Socrate. Criton. Phédon., Platon (trad. Léon Robin), éd. Gallimard, 1968, p. 26-27</div></li></ul>
</div></div></body></html>`

	p := &LocalizedWikiquoteParser{Source: "wikiquote-fr", Language: "fr"}
	result, err := p.Parse(html)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}
	if len(result.Quotes) != 1 {
		t.Fatalf("got %d quotes, want 1: %+v", len(result.Quotes), result.Quotes)
	}
	if result.Quotes[0].Text != "Je ne sais qu'une chose, c'est que je ne sais rien." {
		t.Errorf("text = %q, want the div.citation's own text, not the precisions/ref siblings", result.Quotes[0].Text)
	}
}
