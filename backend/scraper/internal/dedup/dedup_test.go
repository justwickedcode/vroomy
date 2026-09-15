package dedup

import (
	"strings"
	"testing"
)

func TestStripQuoteChars(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{`"hello"`, `hello`},
		{`«hello»`, `hello`},
		{`hello`, `hello`},
		{`hel"lo`, `hel"lo`},
		{`"hel«lo"`, `hel«lo`},
		{`"hello`, `hello`},
		{`hello"`, `hello`},
		{"", ""},
		{`"`, ""},
		{`""`, ""},
		{"\u201chello\u201d", "hello"},
		{"\u275dhello\u275e", "hello"},
	}

	for _, value := range cases {
		got := StripQuoteChars(value.input)
		if got != value.expected {
			t.Errorf("StripQuoteChars(%q) = %q, want %q", value.input, got, value.expected)
		}
	}
}

func TestIsLatinScript(t *testing.T) {
	cases := []struct {
		input    string
		expected bool
	}{
		{"Be the change that you wish to see in the world.", true},
		{"café naïve façade", true}, // accented Latin letters are allowed
		{"", true},
		{"123 !? -- ...", true},                // punctuation/digits have no script
		{"الخيال هو ليل الحياة الجميل", false}, // Arabic
		{"Мысль изреченная есть ложь", false},  // Cyrillic
		{"人生は美しい", false},                      // CJK
		{"Mixed with a bit of عربي in it", false},
		// Real regression: a fully English 300+ letter Plato quote on Wikiquote has exactly
		// one Greek "Η" (capital eta) where a Latin "H" belongs — almost certainly a
		// homoglyph typo in the source, not evidence the quote is non-English. A whole-quote
		// reject on any single non-Latin letter wrongly dropped this one; the ratio-based
		// check must keep it.
		{"Ηow natural it is that those who have spent a long time in the study of philosophy appear ridiculous when they enter the courts of law as speakers. Those who have knocked about in courts and the like from their youth up seem to me, when compared with those who have been brought up in philosophy and similar pursuits, to be as slaves in breeding compared with freemen. The latter always have leisure.", true},
	}

	for _, value := range cases {
		got := IsLatinScript(value.input)
		if got != value.expected {
			t.Errorf("IsLatinScript(%q) = %v, want %v", value.input, got, value.expected)
		}
	}
}

func TestIsTooShort(t *testing.T) {
	cases := []struct {
		input    string
		expected bool
	}{
		// Real regression cases, found live: citation/page-reference fragments that leaked
		// through as if they were standalone quotes.
		{"Ch.8", true},
		{"[7]", true},
		{"p. 78", true},
		{"p. 280", true},
		{"p. 376.", true},
		// Real regression cases that must NOT be flagged — genuine, if terse, quotes.
		{"Be brave", false},
		{"Who Am I?", false},
		{strings.Repeat("a", MinQuoteLength), false}, // exactly at the floor
	}

	for _, value := range cases {
		got := IsTooShort(value.input)
		if got != value.expected {
			t.Errorf("IsTooShort(%q) = %v, want %v", value.input, got, value.expected)
		}
	}
}

func TestLooksLikeDictionaryEntry(t *testing.T) {
	cases := []struct {
		input    string
		expected bool
	}{
		// Real regression cases, found live on German Wikiquote's Ambrose Bierce page
		// ("Devil's Dictionary" entries) — genuine, correctly-attributed quotes, just shaped
		// like reference-book entries rather than something quotable in a game.
		{"Zukunft, die [Subst.], jene Zeit, in der unsere Geschäfte gut gehen.", true},
		{"Eifersüchtig, [Adj.], Unnötig besorgt um etwas.", true},
		{"Realismus, der [Subst.]: die Kunst einer Naturdarstellung.", true},
		// Real regression cases that must NOT match — scholarly/translated quotes commonly
		// bracket an editorial insertion or capitalization fix; these are genuine quotes.
		{"[T]he ancient philosophers all assert that the elements are the causes.", false},
		{"the vicious portion of [our] population shall be produced among us.", false},
		{"We may assume the superiority ceteris paribus [all things being equal] of the demonstrative sciences.", false},
		{"Be the change that you wish to see in the world.", false},
		{"", false},
	}

	for _, value := range cases {
		got := LooksLikeDictionaryEntry(value.input)
		if got != value.expected {
			t.Errorf("LooksLikeDictionaryEntry(%q) = %v, want %v", value.input, got, value.expected)
		}
	}
}

func TestLooksLikeWikiDiscussion(t *testing.T) {
	cases := []struct {
		input    string
		expected bool
	}{
		// Real regression cases, found live on Wikiquote's "June 20"-style calendar
		// (quote-of-the-day nomination) pages — editor discussion/voting, not real quotes.
		{"3 ♞☤☮♌︎Kalki ⚚⚓︎⊙☳☶⚡ 00:35, 12 June 2025 (UTC)", true},
		{"3 Kalki (talk · contributions) 12:04, 17 June 2010 (UTC) with a strong lean toward 4.", true},
		{"2 for comedic value. Zarbon 03:24, 19 May 2008 (UTC)", true},
		{"4 ♞☤♌︎ShreebalaS 23:59, 19 August 2025 (GST)", true},
		{"—This unsigned comment is by 2602:306:34ab:2830:f9f3:3c3a:7f73:59b5 (talk • contribs) .", true},
		// Real quotes that must NOT match — including one genuinely featured on the same
		// class of calendar page as the contamination above.
		{"See, I write jokes for a living, man. I sit in my hotel at night and think of something that's funny.", false},
		{"Be the change that you wish to see in the world.", false},
		{"", false},
	}

	for _, value := range cases {
		got := LooksLikeWikiDiscussion(value.input)
		if got != value.expected {
			t.Errorf("LooksLikeWikiDiscussion(%q) = %v, want %v", value.input, got, value.expected)
		}
	}
}

func TestNormalize(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"  hello  ", "hello"},
		{"HELLO", "hello"},
		{"Hello   World", "hello world"},
		{`"Hello"`, "hello"},
		{"  \"HELLO WORLD\"  ", "hello world"},
		{"", ""},
		{"  ", ""},
		{"\t hello \n", "hello"},
		{"hello\tworld", "hello world"},
	}

	for _, value := range cases {
		got := Normalize(value.input)
		if got != value.expected {
			t.Errorf("Normalize(%q) = %q, want %q", value.input, got, value.expected)
		}
	}
}

func TestSHA256(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"hello", "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"},
		{"", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},
		{"hello world", "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"},
	}

	for _, value := range cases {
		got := SHA256(value.input)
		if got != value.expected {
			t.Errorf("SHA256(%q) = %q, want %q", value.input, got, value.expected)
		}
	}

	if SHA256("hello") == SHA256("HELLO") {
		t.Errorf("SHA256 should be case sensitive")
	}

	if SHA256("hello") != SHA256("hello") {
		t.Errorf("SHA256 should be deterministic")
	}
}

func TestSimhash(t *testing.T) {
	if Simhash("") != 0 {
		t.Errorf("Simhash(\"\") should return 0")
	}

	if Simhash("hello") == 0 {
		t.Errorf("Simhash of single word should not be 0")
	}

	a := Simhash("hello world")
	b := Simhash("hello world")
	if a != b {
		t.Errorf("Simhash is not deterministic: got %d and %d", a, b)
	}

	s1 := Simhash("the quick brown fox")
	s2 := Simhash("the quick brown fox jumps")
	if HammingDistance(s1, s2) > 20 {
		t.Errorf("similar texts too far apart: distance %d", HammingDistance(s1, s2))
	}

	s3 := Simhash("hello world")
	s4 := Simhash("quantum physics thermodynamics")
	if HammingDistance(s3, s4) < 10 {
		t.Errorf("different texts too close: distance %d", HammingDistance(s3, s4))
	}
}

func TestExtractBands(t *testing.T) {
	bands := ExtractBands(0)
	for i, b := range bands {
		if b != 0 {
			t.Errorf("band %d should be 0, got %d", i, b)
		}
	}

	bands = ExtractBands(0x0001000200030004)
	expected := [NumBands]int64{4, 3, 2, 1}
	for i, b := range bands {
		if b != expected[i] {
			t.Errorf("band %d = %d, want %d", i, b, expected[i])
		}
	}

	bands = ExtractBands(Simhash("hello world"))
	for i, b := range bands {
		if b < 0 || b > 65535 {
			t.Errorf("band %d = %d, out of 16 bit range", i, b)
		}
	}
}

func TestHammingDistance(t *testing.T) {
	cases := []struct {
		a, b     int64
		expected int
	}{
		{0, 0, 0},
		{0b0001, 0b0000, 1},
		{0, -1, 64},
		{3285, 3469, 4},
	}

	for _, value := range cases {
		got := HammingDistance(value.a, value.b)
		if got != value.expected {
			t.Errorf("HammingDistance(%d, %d) = %d, want %d", value.a, value.b, got, value.expected)
		}
	}
}
