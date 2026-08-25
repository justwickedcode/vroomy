package parser

import (
	"os"
	"quotes-crawler/internal/models"
	"testing"
)

func TestToscrapeParser_Parse(t *testing.T) {

	expected := []models.Quote{
		{
			Text:   "The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.",
			Author: "Albert Einstein",
			Tags:   []string{"change", "deep-thoughts", "thinking", "world"},
			Source: "quotes.toscrape.com",
		},
		{
			Text:   "It is our choices, Harry, that show what we truly are, far more than our abilities.",
			Author: "J.K. Rowling",
			Tags:   []string{"abilities", "choices"},
			Source: "quotes.toscrape.com",
		},
		{
			Text:   "There are only two ways to live your life. One is as though nothing is a miracle. The other is as though everything is a miracle.",
			Author: "Albert Einstein",
			Tags:   []string{"inspirational", "life", "live", "miracle", "miracles"},
			Source: "quotes.toscrape.com",
		},
		{
			Text:   "The person, be it gentleman or lady, who has not pleasure in a good novel, must be intolerably stupid.",
			Author: "Jane Austen",
			Tags:   []string{"aliteracy", "books", "classic", "humor"},
			Source: "quotes.toscrape.com",
		},
		{
			Text:   "Imperfection is beauty, madness is genius and it's better to be absolutely ridiculous than absolutely boring.",
			Author: "Marilyn Monroe",
			Tags:   []string{"be-yourself", "inspirational"},
			Source: "quotes.toscrape.com",
		},
		{
			Text:   "Try not to become a man of success. Rather become a man of value.",
			Author: "Albert Einstein",
			Tags:   []string{"adulthood", "success", "value"},
			Source: "quotes.toscrape.com",
		},
		{
			Text:   "It is better to be hated for what you are than to be loved for what you are not.",
			Author: "André Gide",
			Tags:   []string{"life", "love"},
			Source: "quotes.toscrape.com",
		},
		{
			Text:   "I have not failed. I've just found 10,000 ways that won't work.",
			Author: "Thomas A. Edison",
			Tags:   []string{"edison", "failure", "inspirational", "paraphrased"},
			Source: "quotes.toscrape.com",
		},
		{
			Text:   "A woman is like a tea bag; you never know how strong it is until it's in hot water.",
			Author: "Eleanor Roosevelt",
			Tags:   []string{"misattributed-eleanor-roosevelt"},
			Source: "quotes.toscrape.com",
		},
		{
			Text:   "A day without sunshine is like, you know, night.",
			Author: "Steve Martin",
			Tags:   []string{"humor", "obvious", "simile"},
			Source: "quotes.toscrape.com",
		},
	}

	data, err := os.ReadFile("testdata/quotes_to_scrape_page_1.html")
	if err != nil {
		t.Fatalf("error reading file: %v", err)
	}

	quotes, err := (&ToscrapeParser{}).Parse(string(data))

	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}

	if len(quotes) != len(expected) {
		t.Fatalf("got %d quotes, want %d", len(quotes), len(expected))
	}

	for i, quote := range quotes {
		if quote.Author != expected[i].Author {
			t.Errorf("got %q, want %q", quote.Author, expected[i].Author)
		}

		if quote.Text != expected[i].Text {
			t.Errorf("got %q, want %q", quote.Text, expected[i].Text)
		}

		if quote.Source != expected[i].Source {
			t.Errorf("got %q, want %q", quote.Source, expected[i].Source)
		}

		if len(quote.Tags) != len(expected[i].Tags) {
			t.Errorf("quote %d tags length = %d, want %d", i, len(quote.Tags), len(expected[i].Tags))
			continue
		}
		for j, tag := range quote.Tags {
			if tag != expected[i].Tags[j] {
				t.Errorf("quote %d tag %d = %q, want %q", i, j, tag, expected[i].Tags[j])
			}
		}
	}
}
