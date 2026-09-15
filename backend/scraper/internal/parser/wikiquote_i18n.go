package parser

import (
	"strconv"
	"strings"

	"quotes-crawler/internal/dedup"
	"quotes-crawler/internal/models"

	"github.com/PuerkitoBio/goquery"
)

// LocalizedWikiquoteParser handles a Wikiquote edition whose page layout is "German-shaped"
// rather than "English-shaped": no single fixed heading name for the real quotes section
// (confirmed live across fr/es/it/pt — each organizes quotes differently: French/Spanish nest
// them a level deeper, under h3 sections inside a top "Citations"/"Citas" bucket; Italian splits
// them across multiple top-level sections, one per cited work; Portuguese uses plain thematic
// top-level sections with no bucket at all) — so, same as German, every heading is treated as
// quote-bearing *except* a known per-edition exclusion list, checked at *any* heading level
// (h2, h3, ...) since French/Spanish's real quotes sit one level deeper than the top bucket.
//
// Deliberately doesn't attempt citation-link NextURLs the way English/German do: confirmed live
// that citation structure varies by edition too (Portuguese/Italian: a citation is a sibling
// <dl> after the <ul>, never inside the <li> at all; Polish: a nested <ul> inside the <li>,
// English-shaped; Spanish: a numbered footnote <sup> pointing at a References section; French:
// an inline <div class="ref">). Chasing five more citation shapes risks repeating the exact
// contamination bug already found and fixed on German (see stripPlainTrailingCitation in
// germanwikiquote.go) for comparatively little payoff — these editions are self-sustaining via
// the same MediaWiki category discovery mechanism as English/German instead (see
// internal/crawler/wikiquote_discovery.go). A nested <ul>/<dl> found *inside* a <li> (the Polish
// and occasional stray case) is still stripped before saving, purely so it can't contaminate the
// quote text — its links just aren't followed.
type LocalizedWikiquoteParser struct {
	Source                  string
	Language                string
	ExcludedHeadingPrefixes []string
}

// Per-edition exclusion lists — the boilerplate end-of-article sections (see also/references/
// bibliography/external links) are standard across Wikimedia projects and named consistently
// per language; the "quotes about, not by, the subject" prefix was confirmed live on each
// edition's own Einstein page before being added (fr: "Citations sur Albert Einstein", es:
// "Citas sobre Einstein", pt: "Disputadas"/"Atribuídas" instead, matching English's own
// Disputed/Misattributed convention). French's "Œuvres choisies" (Selected Works) is excluded
// separately — confirmed live it's a bibliography list (book titles + publisher + ISBN), not
// quotes, sitting as its own sub-heading inside the main Citations bucket.
var (
	WikiquoteFRExcludedHeadingPrefixes = []string{
		"Citations sur", "Œuvres choisies", "Voir aussi", "Références", "Bibliographie",
		"Liens externes", "Notes",
	}
	WikiquoteESExcludedHeadingPrefixes = []string{
		"Citas sobre", "Véase también", "Referencias", "Bibliografía", "Enlaces externos",
	}
	WikiquoteITExcludedHeadingPrefixes = []string{
		"Citazioni su", "Voci correlate", "Altri progetti", "Note", "Bibliografia",
		"Filmografia", "Collegamenti esterni",
	}
	WikiquotePTExcludedHeadingPrefixes = []string{
		"Disputadas", "Atribuídas", "Ver também", "Referências", "Bibliografia",
		"Ligações externas",
	}
	WikiquotePLExcludedHeadingPrefixes = []string{
		"Zobacz też", "Bibliografia", "Linki zewnętrzne", "Przypisy",
	}
	// Swedish, Romanian, Czech, Hungarian each confirmed live to use one single quotes bucket
	// (e.g. Czech's "Výroky") rather than French/Spanish's nested-bucket layout, so these lists
	// only need the standard boilerplate footer sections excluded. Romanian's "Fără sursă"
	// (unsourced) is deliberately *not* excluded — still real, attributed quotes, just without a
	// citation, same as this project already keeps unsourced-but-attributed quotes elsewhere.
	WikiquoteSVExcludedHeadingPrefixes = []string{
		"Se även", "Referenser", "Externa länkar",
	}
	WikiquoteROExcludedHeadingPrefixes = []string{
		"Note", "Referințe", "Vezi și", "Legături externe",
	}
	WikiquoteCSExcludedHeadingPrefixes = []string{
		"Reference", "Externí odkazy", "Poznámky", "Související",
	}
	WikiquoteHUExcludedHeadingPrefixes = []string{
		"Külső hivatkozások", "Kapcsolódó szócikkek", "Jegyzetek", "Források",
	}
	WikiquoteDAExcludedHeadingPrefixes = []string{
		"Fejlciteringer", "Se også", "Referencer", "Eksterne henvisninger",
	}
	WikiquoteNOExcludedHeadingPrefixes = []string{
		"Referanser", "Se også", "Eksterne lenker",
	}
	// Finnish's "quotes about, not by, the subject" heading (e.g. "Einsteinista sanottua" —
	// "Said about Einstein") embeds the person's name *before* the "sanottua" suffix, not after
	// a fixed prefix like French/Spanish/Portuguese do — a plain prefix list can't catch it.
	// Accepted as a known gap rather than adding suffix-matching for one language's one section.
	WikiquoteFIExcludedHeadingPrefixes = []string{
		"Lähteet", "Katso myös", "Aiheesta muualla",
	}
)

func (p *LocalizedWikiquoteParser) Parse(html string) (Result, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return Result{}, err
	}

	author := strings.TrimSpace(doc.Find("h1#firstHeading .mw-page-title-main").Text())
	if author == "" {
		author = strings.TrimSpace(doc.Find("h1#firstHeading").Text())
	}

	var result Result
	// Starts true, not false — real bug found live on Danish: its Einstein page has no heading
	// at all before its real quotes (they sit directly under the intro paragraph; the page's
	// only h2, "Fejlciteringer"/Misquotations, comes later) — starting false meant a page with
	// no heading yet was never in a quotes section, silently returning 0 quotes for every page
	// shaped this way. True-by-default matches the exclusion-list philosophy itself: a section
	// is quote-bearing unless proven otherwise, and that should hold before the first heading
	// too, not just after it.
	inQuotesSection := true

	// levelState[N] is whether headings at level N (2, 3, 4) are currently inside an included
	// section — inherited from the enclosing heading, not decided by its own name alone. Real
	// bug found live on French: the "Œuvres choisies" (bibliography) h3 is correctly excluded by
	// name, but its own h4 sub-headings — one per book title, e.g. "Sciences, éthique,
	// philosophie" — aren't themselves in the exclusion list, so without inheritance, hitting
	// one flipped inQuotesSection back on and leaked bibliography entries as if they were
	// quotes. A deeper heading can only be included if its enclosing heading was too.
	levelState := map[int]bool{1: true}

	// Scoped to #mw-content-text — see the identical comment in wikiquotes.go's Parse for why
	// an unscoped "div.mw-parser-output" selector silently returns 0 quotes on any
	// semi-protected page.
	doc.Find("#mw-content-text div.mw-parser-output").First().Children().Each(func(i int, s *goquery.Selection) {
		if class, ok := s.Attr("class"); ok && strings.Contains(class, "mw-heading") {
			heading, level := headingTextAndLevel(s)
			if level == 0 {
				return
			}
			included := levelState[level-1] && !hasAnyPrefix(heading, p.ExcludedHeadingPrefixes)
			levelState[level] = included
			for l := level + 1; l <= 6; l++ {
				delete(levelState, l)
			}
			inQuotesSection = included
			return
		}
		// Also matches <ol> — see the identical fix in wikiquotes.go (a numbered list is just
		// as valid a quote-bearing list as a bulleted one; a bare "ul" check silently drops it).
		if !inQuotesSection || !s.Is("ul, ol") {
			return
		}

		s.ChildrenFiltered("li").Each(func(i int, li *goquery.Selection) {
			// French sometimes lists a pure bibliographic citation as its own <li> sibling,
			// entirely wrapped in <div class="ref"> with no quote text of its own at all (e.g.
			// "Science, éthique, philosophie [...], éd. Seuil, 1991 (ISBN ...), partie 1.") —
			// confirmed live on fr.wikiquote.org. Skip these outright rather than saving a
			// citation as if it were a quote.
			if children := li.Children(); children.Length() == 1 && children.First().Is("div.ref") {
				return
			}

			clone := li.Clone()
			// Strips any nested <ul>/<dl> sourcing block and footnote markers (e.g. Spanish's
			// "<sup class=\"reference\">[1]</sup>") before reading text — see the type doc
			// comment for why their links aren't followed.
			clone.Find("ul, dl, sup.reference").Remove()

			text := dedup.StripQuoteChars(normalizeWhitespace(clone.Text()))
			if text == "" || author == "" {
				return
			}

			result.Quotes = append(result.Quotes, models.Quote{
				Text:     text,
				Author:   author,
				Source:   p.Source,
				Language: p.Language,
			})
		})
	})

	return result, nil
}

// headingTextAndLevel returns a heading element's own text and numeric level (2-4), or ("", 0)
// if s isn't a recognized heading wrapper.
func headingTextAndLevel(s *goquery.Selection) (string, int) {
	for level := 2; level <= 4; level++ {
		h := s.Find("h" + strconv.Itoa(level))
		if h.Length() > 0 {
			return strings.TrimSpace(h.First().Text()), level
		}
	}
	return "", 0
}
