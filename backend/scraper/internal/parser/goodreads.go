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
// NextURLs comes from two places: the existing a.next_page[rel="next"] pagination link, and
// (new) each quote's author avatar link (a.quoteAvatar/a.leftAlignedImage, present on both page
// types) — a precise, high-confidence discovery signal, not "every link on the page." The
// avatar's href is an author's *profile* page (/author/show/ID.Name); it's rewritten to that
// author's *quotes* page (/author/quotes/ID.Name) before being queued, since that's the only
// URL shape this parser's own selectors are built to handle — confirmed live that
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
		textContainer.Find("br").ReplaceWithHtml(" ")

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
