package models

type Quote struct {
	ID         int64
	Text       string
	Author     string
	Tags       []string
	Source     string
	SHA256Hash string
	Simhash    int64
}
