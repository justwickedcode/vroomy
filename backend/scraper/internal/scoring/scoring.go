package scoring

const (
	DepthPenalty = 0.5
	ErrorPenalty = 3.0
)

const (
	SourceWikiquoteEN = "wikiquote-en"
	SourceWikiquoteDE = "wikiquote-de"
	SourceWikiquoteFR = "wikiquote-fr"
	SourceWikiquoteES = "wikiquote-es"
	SourceWikiquoteIT = "wikiquote-it"
	SourceWikiquotePT = "wikiquote-pt"
	SourceWikiquotePL = "wikiquote-pl"
	SourceWikiquoteSV = "wikiquote-sv"
	SourceWikiquoteRO = "wikiquote-ro"
	SourceWikiquoteCS = "wikiquote-cs"
	SourceWikiquoteHU = "wikiquote-hu"
	SourceWikiquoteDA = "wikiquote-da"
	SourceWikiquoteNO = "wikiquote-no"
	SourceWikiquoteFI = "wikiquote-fi"
	SourceGoodreads   = "goodreads"
)

// These base scores only affect ordering *within* one source's own queue now — cross-source
// fairness is handled by each source running on its own worker goroutine in crawler.go
// (Crawler.runWorker), not by priority score gaps (an earlier design that broke down once a
// source's backlog grew large — see README).
var sourceBaseScores = map[string]float64{
	SourceWikiquoteEN: 2.0,
	SourceWikiquoteDE: 2.0,
	SourceWikiquoteFR: 2.0,
	SourceWikiquoteES: 2.0,
	SourceWikiquoteIT: 2.0,
	SourceWikiquotePT: 2.0,
	SourceWikiquotePL: 2.0,
	SourceWikiquoteSV: 2.0,
	SourceWikiquoteRO: 2.0,
	SourceWikiquoteCS: 2.0,
	SourceWikiquoteHU: 2.0,
	SourceWikiquoteDA: 2.0,
	SourceWikiquoteNO: 2.0,
	SourceWikiquoteFI: 2.0,
	SourceGoodreads:   10.0,
}

const DefaultSourceBase float64 = 1000

func CalculatePriority(source string, depth int, errorCount int) float64 {
	sourceBase, ok := sourceBaseScores[source]
	if !ok {
		sourceBase = DefaultSourceBase
	}

	return sourceBase + (float64(depth) * DepthPenalty) + (float64(errorCount) * ErrorPenalty)
}
