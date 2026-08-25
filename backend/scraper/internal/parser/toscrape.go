package parser

import (
	"quotes-crawler/internal/dedup"
	"strings"

	"quotes-crawler/internal/models"

	"github.com/PuerkitoBio/goquery"
)

type ToscrapeParser struct{}

func (p *ToscrapeParser) Parse(html string) ([]models.Quote, error) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return nil, err
	}

	var quotes []models.Quote

	doc.Find("div.quote").Each(func(i int, s *goquery.Selection) {
		text := dedup.StripQuoteChars(s.Find("span.text").Text())
		author := s.Find("small.author").Text()

		var tags []string
		s.Find("div.tags a.tag").Each(func(i int, tag *goquery.Selection) {
			tags = append(tags, tag.Text())
		})

		quotes = append(quotes, models.Quote{
			Text:   text,
			Author: author,
			Tags:   tags,
			Source: "quotes.toscrape.com",
		})
	})

	return quotes, nil
}
