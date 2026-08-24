package models

import "time"

type URLFrontier struct {
	ID            int64
	URL           string
	Source        string
	Priority      float64
	Depth         int32
	Status        string
	ErrorCount    int32
	LastCrawledAt *time.Time
	CreatedAt     time.Time
}
