package db

import (
	"context"
	"encoding/json"
	"fmt"
	"quotes-crawler/internal/dedup"
	"quotes-crawler/internal/models"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Store struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
}

func NewStore(pool *pgxpool.Pool, rdb *redis.Client) *Store {
	return &Store{pool: pool, rdb: rdb}
}

func bandKey(band int, value int64) string {
	return fmt.Sprintf("simhash:band:%d:%d", band, value)
}

// WarmSimhashCache loads all existing simhashes from Postgres into Redis LSH bands on startup
func (s *Store) WarmSimhashCache(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `SELECT simhash FROM quotes`)
	if err != nil {
		return err
	}
	defer rows.Close()

	pipe := s.rdb.Pipeline()
	for rows.Next() {
		var simhash int64
		if err := rows.Scan(&simhash); err != nil {
			return err
		}
		bands := dedup.ExtractBands(simhash)
		for i, band := range bands {
			pipe.SAdd(ctx, bandKey(i, band), simhash)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	_, err = pipe.Exec(ctx)
	return err
}

// frontierKey namespaces the Redis priority queue by source. Each source gets its own sorted
// set rather than one shared "frontier" — a single shared queue meant that whichever source
// had a lower base priority score would always win ZPOPMIN over the other for as long as it
// had *any* pending item, regardless of how many. That was fine when Wikiquote's backlog was
// a small fixed stopgap list (~20 pages), but broke down completely once real title discovery
// gave it hundreds of pending pages at once: Goodreads' one pending page sat untouched for the
// entire time, confirmed live (476 Wikiquote pending vs. Goodreads' 1, completely unserved).
// Per-source queues plus round-robin polling in the crawl loop (see crawler.go) is what
// actually guarantees both sources keep making progress, instead of relying on priority scores
// to emulate fairness.
func frontierKey(source string) string {
	return "frontier:" + source
}

// WarmFrontierCache loads all pending URLs from Postgres into their per-source Redis queues.
func (s *Store) WarmFrontierCache(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `SELECT url, source, priority FROM url_frontier WHERE status = 'pending'`)
	if err != nil {
		return err
	}
	defer rows.Close()

	pipe := s.rdb.Pipeline()
	for rows.Next() {
		var url, source string
		var priority float64
		if err := rows.Scan(&url, &source, &priority); err != nil {
			return err
		}
		pipe.ZAdd(ctx, frontierKey(source), redis.Z{Score: priority, Member: url})
	}
	if err := rows.Err(); err != nil {
		return err
	}

	_, err = pipe.Exec(ctx)
	return err
}

// PushURL adds url to source's priority queue.
func (s *Store) PushURL(ctx context.Context, source string, url string, priority float64) error {
	return s.rdb.ZAdd(ctx, frontierKey(source), redis.Z{Score: priority, Member: url}).Err()
}

// PopURL returns the lowest-priority pending URL for source, or "" if it has none right now.
func (s *Store) PopURL(ctx context.Context, source string) (string, error) {
	results, err := s.rdb.ZPopMin(ctx, frontierKey(source)).Result()
	if err != nil {
		return "", err
	}
	if len(results) == 0 {
		return "", nil
	}
	return results[0].Member.(string), nil
}

// isNearDuplicate checks LSH bands in Redis, runs Hamming only on candidates
func (s *Store) isNearDuplicate(ctx context.Context, simhash int64) (bool, error) {
	bands := dedup.ExtractBands(simhash)

	// fetch all band members in one round trip
	pipe := s.rdb.Pipeline()
	cmds := make([]*redis.StringSliceCmd, dedup.NumBands)
	for i, band := range bands {
		cmds[i] = pipe.SMembers(ctx, bandKey(i, band))
	}
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		return false, err
	}

	// deduplicate candidates and check Hamming distance
	seen := make(map[int64]struct{})
	for _, cmd := range cmds {
		for _, m := range cmd.Val() {
			val, err := strconv.ParseInt(m, 10, 64)
			if err != nil {
				continue
			}
			if _, ok := seen[val]; ok {
				continue
			}
			seen[val] = struct{}{}
			if dedup.HammingDistance(simhash, val) < dedup.HammingThreshold {
				return true, nil
			}
		}
	}
	return false, nil
}

// addToSimhashCache adds a simhash to all LSH bands in Redis
func (s *Store) addToSimhashCache(ctx context.Context, simhash int64) error {
	bands := dedup.ExtractBands(simhash)
	pipe := s.rdb.Pipeline()
	for i, band := range bands {
		pipe.SAdd(ctx, bandKey(i, band), simhash)
	}
	_, err := pipe.Exec(ctx)
	return err
}

func (s *Store) SaveQuote(ctx context.Context, quote models.Quote) (bool, error) {
	normalizedText := dedup.Normalize(quote.Text)
	sha256Hash := dedup.SHA256(normalizedText)
	simhash := dedup.Simhash(normalizedText)

	language := quote.Language
	if language == "" {
		language = "en" // every parser predating the language field is English-only
	}

	// wordCount powers the typing-game API's length filter (internal/api) — computed here
	// rather than left to the reader, since every quote gets one regardless of which API
	// consumes it later, and computing it once at write time (indexed) is far cheaper than
	// re-splitting every row's text on every random-quote query.
	wordCount := len(strings.Fields(quote.Text))

	tagsJSON, err := json.Marshal(quote.Tags)
	if err != nil {
		return false, err
	}

	nearDup, err := s.isNearDuplicate(ctx, simhash)
	if err != nil {
		return false, err
	}
	if nearDup {
		return false, nil
	}

	tag, err := s.pool.Exec(ctx,
		`INSERT INTO quotes (text, author, tags, source, source_url, language, sha256_hash, simhash, word_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (sha256_hash) DO NOTHING`,
		quote.Text, quote.Author, tagsJSON, quote.Source, quote.SourceURL, language, sha256Hash, simhash, wordCount,
	)
	if err != nil {
		return false, err
	}

	if tag.RowsAffected() == 0 {
		return false, nil
	}

	return true, s.addToSimhashCache(ctx, simhash)
}

func (s *Store) SaveURL(ctx context.Context, urlFrontier models.URLFrontier) (bool, error) {
	if urlFrontier.URL == "" || urlFrontier.Source == "" {
		return false, fmt.Errorf("URL and Source are required")
	}

	if urlFrontier.Priority < 0 {
		return false, fmt.Errorf("priority must be >= 0")
	}

	tag, err := s.pool.Exec(ctx,
		`INSERT INTO url_frontier (url, source, priority, depth)
VALUES ($1, $2, $3, $4)
ON CONFLICT (url) DO NOTHING`,
		urlFrontier.URL, urlFrontier.Source, urlFrontier.Priority, urlFrontier.Depth,
	)
	if err != nil {
		return false, err
	}

	if tag.RowsAffected() == 0 {
		return false, nil
	}

	return true, nil
}

// SaveURLsBatch inserts many URLs for one source/priority/depth in a single round trip instead
// of one INSERT per URL — added because discovery batches (e.g. one Wikiquote category page,
// up to 500 titles) were doing exactly that: 500 sequential awaited INSERTs for what's really
// one bulk operation. Uses unnest to turn the Go slice into a set-returning INSERT ... SELECT,
// still going through the same ON CONFLICT (url) DO NOTHING as SaveURL, and RETURNING url so
// the caller knows exactly which URLs were newly added (for per-URL discovery logging) without
// a second query.
func (s *Store) SaveURLsBatch(ctx context.Context, urls []string, source string, priority float64, depth int32) ([]string, error) {
	if len(urls) == 0 {
		return nil, nil
	}

	sources := make([]string, len(urls))
	priorities := make([]float64, len(urls))
	depths := make([]int32, len(urls))
	for i := range urls {
		sources[i] = source
		priorities[i] = priority
		depths[i] = depth
	}

	rows, err := s.pool.Query(ctx,
		`INSERT INTO url_frontier (url, source, priority, depth)
         SELECT * FROM unnest($1::text[], $2::text[], $3::float8[], $4::int[])
         ON CONFLICT (url) DO NOTHING
         RETURNING url`,
		urls, sources, priorities, depths,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var inserted []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		inserted = append(inserted, u)
	}
	return inserted, rows.Err()
}

// PushURLsBatch adds many URLs to source's priority queue in a single Redis round trip
// (variadic ZADD) instead of one ZADD per URL — the Redis-side counterpart to SaveURLsBatch.
func (s *Store) PushURLsBatch(ctx context.Context, source string, urls []string, priority float64) error {
	if len(urls) == 0 {
		return nil
	}

	members := make([]redis.Z, len(urls))
	for i, u := range urls {
		members[i] = redis.Z{Score: priority, Member: u}
	}
	return s.rdb.ZAdd(ctx, frontierKey(source), members...).Err()
}

func (s *Store) MarkURLDone(ctx context.Context, url string) error {
	if url == "" {
		return fmt.Errorf("URL is required")
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE url_frontier SET status = 'done', last_crawled_at=NOW() WHERE url = $1`,
		url,
	)
	if err != nil {
		return err
	}
	return nil
}

func (s *Store) MarkURLInProgress(ctx context.Context, url string) error {
	if url == "" {
		return fmt.Errorf("URL is required")
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE url_frontier SET status = 'in_progress' WHERE url = $1`,
		url,
	)
	return err

}

// RequeueStuckInProgress resets any 'in_progress' row back to 'pending' and returns how many
// were reset. A row stuck at 'in_progress' means a previous crawler process was killed (or
// crashed) mid-fetch: PopURL already removed it from Redis, so without this it would never be
// retried — lost work, observed live (crawler restarted mid-crawl, left 3 rows stranded).
// Since this crawler runs as a single synchronous loop, any 'in_progress' row found at
// startup is necessarily leftover from a previous run, never the current one.
func (s *Store) RequeueStuckInProgress(ctx context.Context) (int64, error) {
	tag, err := s.pool.Exec(ctx, `UPDATE url_frontier SET status = 'pending' WHERE status = 'in_progress'`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// RetryURL resets a URL back to pending with an incremented error_count and an updated
// priority, for a bounded automatic retry instead of permanently failing on the first bad
// fetch. Unlike MarkURLFailed, this doesn't touch last_crawled_at — the URL hasn't actually
// been crawled yet, just attempted. The caller (Crawler.failOrRetry) still needs to push the
// URL back onto the source's Redis queue itself after this succeeds — it isn't done here, so
// the DB write (source of truth for "a retry was recorded") always commits before the URL
// becomes fetchable again.
func (s *Store) RetryURL(ctx context.Context, url string, errorCount int32, priority float64) error {
	if url == "" {
		return fmt.Errorf("URL is required")
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE url_frontier SET status = 'pending', error_count = $2, priority = $3 WHERE url = $1`,
		url, errorCount, priority,
	)
	return err
}

func (s *Store) MarkURLFailed(ctx context.Context, url string) error {
	if url == "" {
		return fmt.Errorf("URL is required")
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE url_frontier SET status = 'failed', last_crawled_at=NOW(), error_count = error_count + 1 WHERE url = $1`,
		url,
	)
	return err
}

func (s *Store) GetURLByURL(ctx context.Context, url string) (models.URLFrontier, error) {
	var u models.URLFrontier
	err := s.pool.QueryRow(ctx,
		`SELECT id, url, source, priority, depth, status, error_count, last_crawled_at, created_at
		 FROM url_frontier WHERE url = $1`,
		url,
	).Scan(
		&u.ID, &u.URL, &u.Source, &u.Priority, &u.Depth,
		&u.Status, &u.ErrorCount, &u.LastCrawledAt, &u.CreatedAt,
	)
	return u, err
}

// HasAnyURLs reports whether the frontier has ever been seeded, regardless of status.
// Unlike checking GetPendingURLs for emptiness, this stays true once seeding has happened
// even after every seed URL finishes (done/failed) — a "pending only" check would otherwise
// re-trigger seeding (and re-crawl already-completed pages) the moment a batch finishes.
func (s *Store) HasAnyURLs(ctx context.Context) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM url_frontier)`).Scan(&exists)
	return exists, err
}

// CountPendingBySource returns how many url_frontier rows for source are still 'pending' —
// used to decide whether a source needs more work discovered before it runs dry.
func (s *Store) CountPendingBySource(ctx context.Context, source string) (int64, error) {
	var count int64
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM url_frontier WHERE source = $1 AND status = 'pending'`,
		source,
	).Scan(&count)
	return count, err
}

// discoveryCursorKey namespaces continuation-token storage in Redis by source, so each
// source's title-enumeration (e.g. Wikiquote's MediaWiki allpages) can resume where it left
// off across restarts without needing its own Postgres table.
func discoveryCursorKey(source string) string {
	return fmt.Sprintf("discovery:cursor:%s", source)
}

// GetDiscoveryCursor returns the saved continuation token for source's title discovery, or
// "" if none has been saved yet (i.e. discovery hasn't run, or has reached the end).
func (s *Store) GetDiscoveryCursor(ctx context.Context, source string) (string, error) {
	val, err := s.rdb.Get(ctx, discoveryCursorKey(source)).Result()
	if err == redis.Nil {
		return "", nil
	}
	return val, err
}

// SetDiscoveryCursor saves source's title-discovery continuation token for next time.
func (s *Store) SetDiscoveryCursor(ctx context.Context, source string, cursor string) error {
	return s.rdb.Set(ctx, discoveryCursorKey(source), cursor, 0).Err()
}

func (s *Store) GetPendingURLs(ctx context.Context) ([]models.URLFrontier, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, url, source, priority, depth, status, error_count, last_crawled_at, created_at 
		 FROM url_frontier WHERE status = 'pending' ORDER BY priority`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var urls []models.URLFrontier
	for rows.Next() {
		var u models.URLFrontier
		if err := rows.Scan(
			&u.ID, &u.URL, &u.Source, &u.Priority, &u.Depth,
			&u.Status, &u.ErrorCount, &u.LastCrawledAt, &u.CreatedAt,
		); err != nil {
			return nil, err
		}
		urls = append(urls, u)
	}
	return urls, rows.Err()
}
