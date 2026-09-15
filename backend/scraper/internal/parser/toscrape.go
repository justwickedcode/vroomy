package parser

import (
	"quotes-crawler/internal/dedup"
	"strings"

	"quotes-crawler/internal/models"

	"github.com/PuerkitoBio/goquery"
)

const toscrapeBaseURL = "https://quotes.toscrape.com"

type ToscrapeParser struct{}

func (p *ToscrapeParser) Parse(html string) (Result, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return Result{}, err
	}

	var result Result

	doc.Find("div.quote").Each(func(i int, s *goquery.Selection) {
		text := dedup.StripQuoteChars(s.Find("span.text").Text())
		author := s.Find("small.author").Text()

		var tags []string
		s.Find("div.tags a.tag").Each(func(i int, tag *goquery.Selection) {
			tags = append(tags, tag.Text())
		})

		result.Quotes = append(result.Quotes, models.Quote{
			Text:     text,
			Author:   author,
			Tags:     tags,
			Source:   "quotes.toscrape.com",
			Language: "en",
		})
	})

	if next, ok := doc.Find("li.next a").Attr("href"); ok && next != "" {
		result.NextURLs = append(result.NextURLs, resolveToscrapeURL(next))
	}

	return result, nil
}

func resolveToscrapeURL(href string) string {
	if strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://") {
		return href
	}
	return toscrapeBaseURL + href
}
