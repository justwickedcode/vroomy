package parser

import (
	"os"
	"quotes-crawler/internal/models"
	"testing"
)

func TestGoodreadsParser_Parse(t *testing.T) {
	expected := []models.Quote{
		{
			// Real <br>-separated lines in the fixture HTML — now preserved as real newlines
			// (see preserveLineBreaks/normalizeWhitespace) instead of flattened to spaces, since
			// this is exactly the kind of poem-shaped quote that fix exists for.
			Text:   "You've gotta dance like there's nobody watching,\nLove like you'll never be hurt,\nSing like there's nobody listening,\nAnd live like it's heaven on earth.",
			Author: "William W. Purkey",
			Tags:   []string{"dance", "heaven", "hurt", "inspirational", "life", "love", "sing"},
			Source: "goodreads",
		},
		{
			Text:   "Be the change that you wish to see in the world.",
			Author: "Mahatma Gandhi",
			Tags:   []string{"action", "change", "inspirational", "misattributed-to-gandhi", "philosophy", "wish"},
			Source: "goodreads",
		},
		{
			// This card carries a trailing work title ("A Testament of Hope...") sharing the
			// same "authorOrTitle" class on an <a> — must not bleed into text/author.
			Text:   "Darkness cannot drive out darkness: only light can do that. Hate cannot drive out hate: only love can do that.",
			Author: "Martin Luther King Jr.",
			Tags:   []string{"darkness", "drive-out", "hate", "inspirational", "light", "love", "peace"},
			Source: "goodreads",
		},
		{
			Text:   "Live as if you were to die tomorrow. Learn as if you were to live forever.",
			Author: "Mahatma Gandhi",
			Tags:   []string{"carpe-diem", "education", "inspirational", "learning"},
			Source: "goodreads",
		},
	}

	data, err := os.ReadFile("testdata/goodreads_inspirational_tag.html")
	if err != nil {
		t.Fatalf("error reading file: %v", err)
	}

	result, err := (&GoodreadsParser{}).Parse(string(data))
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

	// Each quote's author avatar link is rewritten from its profile URL (/author/show/ID.Name)
	// to the corresponding quotes-listing URL (/author/quotes/ID.Name), and every tag link in
	// that same quote's tags: footer is queued too (the fixture's 4 quotes carry 20 distinct
	// tags between them, most never in crawler.go's hardcoded seed list — see GoodreadsParser's
	// doc comment) — all alongside the existing pagination link, in document order, with
	// cross-quote duplicates (the repeated "inspirational"/"love" tags, and Gandhi appearing as
	// the author of two separate quote cards) collapsed by dedupeStrings to their first
	// occurrence.
	wantNext := []string{
		"https://www.goodreads.com/quotes/tag/dance",
		"https://www.goodreads.com/quotes/tag/heaven",
		"https://www.goodreads.com/quotes/tag/hurt",
		"https://www.goodreads.com/quotes/tag/inspirational",
		"https://www.goodreads.com/quotes/tag/life",
		"https://www.goodreads.com/quotes/tag/love",
		"https://www.goodreads.com/quotes/tag/sing",
		"https://www.goodreads.com/author/quotes/1744830.William_W_Purkey",
		"https://www.goodreads.com/quotes/tag/action",
		"https://www.goodreads.com/quotes/tag/change",
		"https://www.goodreads.com/quotes/tag/misattributed-to-gandhi",
		"https://www.goodreads.com/quotes/tag/philosophy",
		"https://www.goodreads.com/quotes/tag/wish",
		"https://www.goodreads.com/author/quotes/5810891.Mahatma_Gandhi",
		"https://www.goodreads.com/quotes/tag/darkness",
		"https://www.goodreads.com/quotes/tag/drive-out",
		"https://www.goodreads.com/quotes/tag/hate",
		"https://www.goodreads.com/quotes/tag/light",
		"https://www.goodreads.com/quotes/tag/peace",
		"https://www.goodreads.com/author/quotes/23924.Martin_Luther_King_Jr_",
		"https://www.goodreads.com/quotes/tag/carpe-diem",
		"https://www.goodreads.com/quotes/tag/education",
		"https://www.goodreads.com/quotes/tag/learning",
		"https://www.goodreads.com/quotes/tag/inspirational?page=2",
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

func TestGoodreadsParser_Parse_LastPage(t *testing.T) {
	html := `<html><body>
<div class="quote mediumText">
<div class="quoteText">“Only one quote on the last page.”<br/>―<span class="authorOrTitle">Nobody</span></div>
</div>
<div><span class="previous_page" >« previous</span> <span class="next_page disabled">next »</span></div>
</body></html>`

	result, err := (&GoodreadsParser{}).Parse(html)
	if err != nil {
		t.Fatalf("Parse() failed: %v", err)
	}
	if len(result.Quotes) != 1 {
		t.Fatalf("got %d quotes, want 1", len(result.Quotes))
	}
	if len(result.NextURLs) != 0 {
		t.Errorf("got NextURLs %v, want none on the last page", result.NextURLs)
	}
}
