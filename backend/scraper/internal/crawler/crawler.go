package crawler

import (
	"context"
	"log"
	"quotes-crawler/internal/db"
	"quotes-crawler/internal/fetcher"
	"quotes-crawler/internal/models"
	"quotes-crawler/internal/parser"
	"quotes-crawler/internal/scoring"
	"time"
)

type Crawler struct {
	store *db.Store
}

func New(store *db.Store) *Crawler {
	return &Crawler{
		store: store,
	}
}

func (c *Crawler) Run(ctx context.Context) error {

	err := c.store.WarmSimhashCache(ctx)
	if err != nil {
		return err
	}
	log.Printf("Simhash cache warmed up")

	err = c.store.WarmFrontierCache(ctx)
	if err != nil {
		return err
	}

	err = c.SeedFrontier(ctx)
	if err != nil {
		return err
	}
	log.Printf("Seed frontier cache warmed up")

	for {
		url, err := c.store.PopURL(ctx)
		if err != nil {
			log.Printf("Could not get the first URL: %s\n", err)
			continue
		}
		log.Printf("Test")
		if url == "" {
			time.Sleep(5 * time.Second)
			continue
		}
		err = c.store.MarkURLInProgress(ctx, url)
		if err != nil {
			log.Printf("Could not mark the URL: %s\n", err)
			continue
		}
		html, err := fetcher.Fetch(url)
		if err != nil {
			err = c.store.MarkURLFailed(ctx, url)
			if err != nil {
				log.Printf("Could not mark the URL: %s\n", err)
			}
			continue
		}
		_, err = (&parser.ToscrapeParser{}).Parse(html) // brainy not implemented

		if err != nil {
			log.Printf("Could not parse the URL: %s\n", err)
			err = c.store.MarkURLFailed(ctx, url)
			if err != nil {
				log.Printf("Could not mark the URL: %s\n", err)
			}
			continue
		}

		err = c.store.MarkURLDone(ctx, url)
		if err != nil {
			log.Printf("Could not mark the URL as done: %s\n", err)
			continue
		}
	}
}

func (c *Crawler) SeedFrontier(ctx context.Context) error {
	results, err := c.store.GetPendingURLs(ctx)
	if err != nil {
		return err
	}
	if len(results) != 0 {
		log.Printf("Frontier already seeded.")
		return nil
	}

	priority := scoring.CalculatePriority("brainyquote", 0, 0)
	seeds := []models.URLFrontier{
		{URL: "https://www.brainyquote.com/topics/inspirational-quotes", Source: "brainyquote", Priority: priority},
	}

	for _, seed := range seeds {
		_, err := c.store.SaveURL(ctx, seed)
		if err != nil {
			log.Printf("Failed to save URL: %v", err)
			continue
		}
		err = c.store.PushURL(ctx, seed.URL, seed.Priority)
		if err != nil {
			log.Printf("Failed to push URL to Redis: %v", err)
		}
	}

	return nil
}
