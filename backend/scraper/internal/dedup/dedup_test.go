package dedup

import "testing"

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
	}

	for _, value := range cases {
		got := StripQuoteChars(value.input)
		if got != value.expected {
			t.Errorf("StripQuoteChars(%q) = %q, want %q", value.input, got, value.expected)
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
