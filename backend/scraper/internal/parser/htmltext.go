package parser

import "github.com/PuerkitoBio/goquery"

// preserveLineBreaks replaces every <br> element within sel with a literal newline text node, so
// that a later .Text() call produces real line breaks instead of silently losing them —
// goquery's .Text() concatenates text nodes with nothing inserted at a <br> boundary on its own.
//
// Confirmed live as the root mechanism behind two real bugs, not just "poems look nicer with
// line breaks": a Wikiquote-rendered poem's <br>-separated lines were previously flattened to a
// single run-on sentence (readable but wrong), and in a worse case found live on a Polish poem
// page, words were fused together with *zero* separator at all where a <br> sat directly between
// two text nodes ("KICIA KOCIAWpłynęłam" — "KOCIA" and "Wpłynęłam" from consecutive lines, jammed
// together). Confirmed live on a real page (en.wikiquote.org/wiki/Edgar_Allan_Poe) that
// Wikiquote renders verse this way — <br>-separated text within one <li>/<b>, not separate <li>
// elements — so this needed fixing at the DOM level before extraction, not by trying to detect
// and re-insert missing separators after the fact.
//
// Mutates sel's underlying DOM in place (a goquery Selection shares the same document tree, it
// doesn't copy it) — call this once, on the whole content scope, before any .Text() call
// anywhere within it; every parser in this package does so immediately after selecting
// "#mw-content-text div.mw-parser-output", before walking its children.
func preserveLineBreaks(sel *goquery.Selection) {
	sel.Find("br").ReplaceWithHtml("\n")
}
