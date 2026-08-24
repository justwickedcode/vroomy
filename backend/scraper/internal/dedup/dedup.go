package dedup

import (
	"crypto/sha256"
	"fmt"
	"hash/fnv"
	"io"
	"math/bits"
	"regexp"
	"strings"
)

const (
	NumBands               = 4
	BandBits               = 16
	HammingThreshold       = 3
	bandMask         int64 = (1 << BandBits) - 1
)

var whitespaceRegex = regexp.MustCompile(`\s+`)

func StripQuoteChars(text string) string {
	return strings.Trim(text, "\"\u201c\u201d«»")
}

func Normalize(text string) string {
	text = strings.TrimSpace(text)
	text = StripQuoteChars(text)
	text = whitespaceRegex.ReplaceAllString(text, " ")
	text = strings.ToLower(text)
	return text
}

func SHA256(text string) string {
	return fmt.Sprintf("%x", sha256.Sum256([]byte(text)))
}

func Simhash(text string) int64 {
	words := strings.Fields(text)
	var counter [64]int64

	h := fnv.New64a()
	for _, word := range words {
		h.Reset()
		if _, err := io.WriteString(h, word); err != nil {
			return 0
		}
		hash := h.Sum64()
		for bit := 0; bit < 64; bit++ {
			if (hash>>bit)&1 == 1 {
				counter[bit]++
			} else {
				counter[bit]--
			}
		}
	}

	var fingerprint int64
	for bit := 0; bit < 64; bit++ {
		if counter[bit] > 0 {
			fingerprint |= 1 << bit
		}
	}
	return fingerprint
}

func ExtractBands(simhash int64) [NumBands]int64 {
	var bands [NumBands]int64
	for i := 0; i < NumBands; i++ {
		bands[i] = (simhash >> (i * BandBits)) & bandMask
	}
	return bands
}

func HammingDistance(a, b int64) int {
	return bits.OnesCount64(uint64(a ^ b))
}
