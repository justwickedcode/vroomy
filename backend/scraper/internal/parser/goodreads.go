package parser

import (
	"regexp"
	"strings"

	"quotes-crawler/internal/dedup"
	"quotes-crawler/internal/models"

	"github.com/PuerkitoBio/goquery"
)

const goodreadsBaseURL = "https://www.goodreads.com"

// trailing "—"/"―"/"–" style separators Goodreads puts between the quote and the author name
var goodreadsTrailingSeparator = regexp.MustCompile(`[\s\x{2010}-\x{2015}-]+$`)

// GoodreadsParser extracts quotes from a Goodreads quote-tag page (e.g.
// https://www.goodreads.com/quotes/tag/inspirational) or an author quotes page
// (e.g. https://www.goodreads.com/author/quotes/9810.Albert_Einstein). The quote card is
// selected on the "quote" class alone, not "quote.mediumText" — confirmed live the two page
// types render it differently (tag pages: <div class="quote mediumText">; author pages:
// <div class='quote'>, no mediumText at all), and requiring both classes meant this parser
// silently extracted zero quotes from every author page, a real gap only found once author
// pages started actually being discovered (see NextURLs below).
//
// NextURLs comes from three places: the existing a.next_page[rel="next"] pagination link, each
// quote's author avatar link (a.quoteAvatar/a.leftAlignedImage, present on both page types), and
// (new) every tag link in that same quote's own tags:  footer (div.greyText.smallText.left a —
// the exact selector already walked to build Quote.Tags, just also reading each anchor's href).
// All three are precise, high-confidence discovery signals, not "every link on the page."
//
// The tag links matter the most for actual discoverable breadth: the crawler's only other
// source of Goodreads tags is a short hardcoded seed list (goodreadsTags in crawler.go, ~19
// curated names), but nearly every real quote carries several much more specific, long-tail
// tags a curated list would never think to include — confirmed live against this parser's own
// fixture (internal/parser/testdata/goodreads_inspirational_tag.html): 4 quotes on a single
// "inspirational" tag page surface 20 distinct tags between them, and only 3 of those
// (inspirational, life, love) are anywhere in the hardcoded seed list — "dance", "heaven",
// "misattributed-to-gandhi", "carpe-diem", and 16 others are net-new discovery, from one page.
// Combined with author-page discovery, this turns a fixed ~19-tag universe into an organically
// growing one: every newly discovered tag page surfaces more quotes, each with its own tags and
// authors, the same compounding-discovery shape already proven safe for Wikiquote's
// citation-link/subcategory-recursion discovery — bounded in practice by the real tag graph's
// own size, not a number chosen up front.
//
// The avatar's href is an author's *profile* page (/author/show/ID.Name); it's rewritten to
// that author's *quotes* page (/author/quotes/ID.Name) before being queued, since that's the
// only URL shape this parser's own selectors are built to handle — confirmed live that
// /author/show/ doesn't even render a matching quote card at all, and that the ID.Name suffix
// carries over unchanged between the two paths.
type GoodreadsParser struct{}

// goodreadsAuthorShowLink matches an author profile link like "/author/show/5810891.Mahatma_Gandhi"
// so its ID.Name suffix can be reused to build the corresponding /author/quotes/ URL.
var goodreadsAuthorShowLink = regexp.MustCompile(`^/author/show/(.+)$`)

func (p *GoodreadsParser) Parse(html string) (Result, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return Result{}, err
	}

	var result Result

	doc.Find("div.quote").Each(func(i int, s *goquery.Selection) {
		// A trailing work title (e.g. "Martin Luther King Jr., A Testament of Hope") also
		// carries class "authorOrTitle" but on an <a>, not the author's <span> — take only
		// the first (the span) and drop the trailing comma left when a title follows it.
		author := strings.TrimSpace(s.Find("span.authorOrTitle").First().Text())
		author = strings.TrimRight(author, ", ")

		textContainer := s.Find("div.quoteText").Clone()
		// Removes both the author <span> and any trailing work-title <a> — both share this
		// class regardless of tag, and leaving the title in would bleed into the quote text.
		textContainer.Find(".authorOrTitle").Remove()
		// A real '\n', not a space — a Goodreads quote can be a submitted poem excerpt just as
		// much as ordinary prose, and normalizeWhitespace (below) now preserves single newlines
		// instead of flattening them, matching the same fix applied to every Wikiquote parser.
		textContainer.Find("br").ReplaceWithHtml("\n")

		text := strings.TrimSpace(textContainer.Text())
		text = goodreadsTrailingSeparator.ReplaceAllString(text, "")
		text = dedup.StripQuoteChars(strings.TrimSpace(text))
		text = normalizeWhitespace(text)

		if text == "" || author == "" {
			return
		}

		var tags []string
		s.Find("div.greyText.smallText.left a").Each(func(i int, tag *goquery.Selection) {
			tags = append(tags, strings.TrimSpace(tag.Text()))
			if href, ok := tag.Attr("href"); ok && href != "" {
				result.NextURLs = append(result.NextURLs, resolveGoodreadsURL(href))
			}
		})

		result.Quotes = append(result.Quotes, models.Quote{
			Text:     text,
			Author:   author,
			Tags:     tags,
			Source:   "goodreads",
			Language: "en",
		})

		if href, ok := s.Find("a.quoteAvatar").Attr("href"); ok {
			if m := goodreadsAuthorShowLink.FindStringSubmatch(href); m != nil {
				result.NextURLs = append(result.NextURLs, goodreadsBaseURL+"/author/quotes/"+m[1])
			}
		}
	})

	if next, ok := doc.Find(`a.next_page[rel="next"]`).Attr("href"); ok && next != "" {
		result.NextURLs = append(result.NextURLs, resolveGoodreadsURL(next))
	}

	result.NextURLs = dedupeStrings(result.NextURLs)
	return result, nil
}

func resolveGoodreadsURL(href string) string {
	if strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://") {
		return href
	}
	return goodreadsBaseURL + href
}
