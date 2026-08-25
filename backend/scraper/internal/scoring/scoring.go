package scoring

const (
	DepthPenalty = 0.5
	ErrorPenalty = 3.0
)

const (
	SourceQuotable    = "quotable"
	SourceBrainyQuote = "brainyquote"
	SourceGoodreads   = "goodreads"
)

var sourceBaseScores = map[string]float64{
	SourceQuotable:    1.0,
	SourceBrainyQuote: 5.0,
	SourceGoodreads:   20.0,
}

const DefaultSourceBase float64 = 1000

func CalculatePriority(source string, depth int, errorCount int) float64 {
	sourceBase, ok := sourceBaseScores[source]
	if !ok {
		sourceBase = DefaultSourceBase
	}

	return sourceBase + (float64(depth) * DepthPenalty) + (float64(errorCount) * ErrorPenalty)
}
