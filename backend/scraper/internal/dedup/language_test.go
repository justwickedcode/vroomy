package dedup

import "testing"

func TestMatchesClaimedLanguage(t *testing.T) {
	cases := []struct {
		name     string
		text     string
		language string
		expected bool
	}{
		// Real regression cases, found live: quotes tagged language="en" that are actually
		// Latin, Portuguese, or Romanian — all Latin-*script*, so IsLatinScript alone can't
		// catch them.
		{
			name:     "Seneca, pure Latin, tagged en",
			text:     "Huius sapientis opus unum est de divinis humanisque verum invenire; ab hac numquam recedit religio",
			language: "en",
			expected: false,
		},
		{
			name:     "Jordanes, pure Latin, tagged en",
			text:     "Post victorias tantarum gentium, post orbem, si consistatis, edomitum, ineptum iudicaveram si quo pergerem",
			language: "en",
			expected: false,
		},
		{
			name:     "Fernando Pessoa, Portuguese, tagged en",
			text:     "Descobri que a leitura é uma forma servil de sonhar. Se tenho de sonhar, porque não sonhar os meus próprios sonhos",
			language: "en",
			expected: false,
		},
		{
			name:     "Marin Sorescu, Romanian, tagged en",
			text:     "Uneori uit unde mă aflu și zâmbesc așa, fără motiv. Câteodată sunt vesel. Vesel de tot",
			language: "en",
			expected: false,
		},
		// Real regression case, found live after the user reported French quotes still
		// leaking through tagged language="en" — this one scored 0.0318 for "en", clearing
		// the old absolute-threshold check (0.025) despite being fully French (French itself
		// scored 0.58, 18x higher). Confirmed as a genuine, current leak (not a stale
		// pre-fix row) before adding this test. See topLanguageConfidenceFloor /
		// topLanguageDominanceRatio in language.go.
		{
			name:     "Oscar Wilde quote page, pure French, tagged en",
			text:     "La nature ne fait jamais des sauts.",
			language: "en",
			expected: false,
		},
		{
			name:     "genuine English, real quote",
			text:     "The world as we have created it is a process of our thinking. It cannot be changed without changing our thinking.",
			language: "en",
			expected: true,
		},
		{
			name:     "genuine German, real quote",
			text:     "Wie diese Büste in dem Marmorblock, dachte Miriam, so ist unser Einzelschicksal, im Kalk der Zeit eingeschlossen, schon vorhanden.",
			language: "de",
			expected: true,
		},
		// Below minLengthForLanguageCheck: must pass regardless of language, since the
		// statistics aren't reliable at this length — confirmed live that real short English
		// quotes ("War is war.", "Excelsior!") score as low as genuine non-English text does.
		{
			name:     "short quote, under length threshold",
			text:     "War is war.",
			language: "en",
			expected: true,
		},
		// Real regression case: found via a full-corpus audit after the first threshold
		// (0.05) was picked — this genuine, unambiguous English quote scored 0.0415, just
		// under it. Confirmed the highest-scoring real leak found was 0.0196, so the threshold
		// was lowered to 0.025 to sit between the two with margin on both sides.
		{
			name:     "Madonna, genuine English, near the confidence boundary",
			text:     "I'm not a feminist, I'm a humanist.",
			language: "en",
			expected: true,
		},
		{
			name:     "unrecognized language code passes through",
			text:     "Huius sapientis opus unum est de divinis humanisque verum invenire; ab hac numquam recedit religio",
			language: "ja",
			expected: true,
		},
	}

	for _, c := range cases {
		got := MatchesClaimedLanguage(c.text, c.language)
		if got != c.expected {
			t.Errorf("%s: MatchesClaimedLanguage(%q, %q) = %v, want %v", c.name, c.text, c.language, got, c.expected)
		}
	}
}
