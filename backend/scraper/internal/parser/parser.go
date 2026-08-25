package parser

import "quotes-crawler/internal/models"

type Result struct {
	Quotes   []models.Quote
	NextURLs []string
}

type Parser interface {
	Parse(html string) (Result, error)
}
