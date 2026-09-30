package crawler

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"quotes-crawler/internal/db"
	"quotes-crawler/internal/dedup"
	"quotes-crawler/internal/fetcher"
	"quotes-crawler/internal/models"
	"quotes-crawler/internal/parser"
	"quotes-crawler/internal/scoring"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	// defaultMinSourceDelay is the minimum time between two fetches of the same source, used
	// for any source without a specific entry in minSourceDelayBySource.
	defaultMinSourceDelay = 3 * time.Second

	// idlePollInterval is how long a source's worker sleeps when it has nothing to do at all —
	// on cooldown or genuinely out of pending work, with no new work to top up. Short, because
	// something is likely to free up soon (its cooldown ticking down), but not zero, to avoid
	// busy-spinning Redis/Postgres.
	idlePollInterval = 2 * time.Second

	// slowFetchWarn logs a warning when a single fetch takes longer than this — the visible,
	// live signal for "this request just got soft-throttled" instead of only finding out via
	// manual curl testing after the fact.
	slowFetchWarn = 10 * time.Second

	// errorBackoff is a short pause after a Redis/Postgres error before retrying the loop.
	// Without it, a persistent outage (Redis restarting, Postgres unreachable) spins the loop
	// as fast as the CPU allows, hammering both the log and the struggling dependency with
	// reconnect attempts — the same "too aggressive" problem as no fetch rate limiting, just
	// against our own infrastructure instead of a crawl target.
	errorBackoff = 1 * time.Second

	// goodreadsStallPenalty is how long Goodreads specifically is treated as unavailable after a
	// slow fetch (see slowFetchWarn) or an outright failure — matches its own observed stall
	// duration (~60s, still 200 OK, just slow), long enough to actually mean something rather
	// than a slightly-longer version of the normal per-source delay.
	goodreadsStallPenalty = 60 * time.Second

	// wikiquoteStallPenalty is the equivalent for any Wikiquote edition — deliberately much
	// shorter than Goodreads', lowered explicitly ("why backing off for 1 entire minute, why for
	// so long?"). Reusing Goodreads' 60s here was never separately calibrated for Wikiquote's
	// own failure mode: a 429 is an explicit, short-lived rejection that clears once request
	// volume drops, not Goodreads' persistent minute-long soft-throttle. With fourteen
	// independent editions running, there's no need for the one that stalled to sit out nearly
	// as long — `abandonExperimentalPace` already provides the lasting protection (permanently
	// widening *that* source's ongoing pace the instant a real 429 is seen); this penalty is
	// only about the timing of the very next retry. Bumped 10s → 15s the same session — a little
	// more margin against getting rate-limited again on the very next attempt.
	wikiquoteStallPenalty = 15 * time.Second

	// wikiquoteDeadStreakThreshold: after this many consecutive Wikiquote pages in a row with
	// 0 quotes, the current discovery category is treated as low-yield and skipped early
	// rather than ground through to its end. Categories aren't perfectly pure — some
	// non-biographical pages (year articles, topic pages like "Black people") are members
	// too, confirmed live — so this is a second layer of defense on top of category-based
	// discovery, not a replacement for it.
	wikiquoteDeadStreakThreshold = 5

	// minFrontierBuffer: a source's own topUp is only skipped once its pending count reaches
	// this many — requested explicitly ("when you have none anymore, focus on filling that
	// queue... aggressive on filling the queue"). Previously topUp for a source was skipped the
	// instant even a single URL was pending, so a source spent almost all its time fetching
	// pages one at a time and only ever topped up in the rare iteration its queue had *fully*
	// drained to zero — fine once a source has a healthy backlog, but slow to rebuild one from
	// scratch. Below this buffer, runWorker prioritizes discovery over fetching (still falling
	// through to fetch whatever's already pending if topUp itself has nothing more to add right
	// now, so quote processing never fully stops) until the buffer is rebuilt; at or above it,
	// behavior is exactly the old "only top up when truly empty" pace.
	minFrontierBuffer = 20

	// wikiquoteEmptyStreakBeforeRandom: after this many consecutive top-up calls in a row add
	// zero new URLs (the curated category walk, including its recursive subcategory descent,
	// genuinely finding nothing new right then), fall back to topUpWikiquoteRandomPages once.
	// Lowered from 10 to 2 at the user's explicit request: the smaller localized editions (2-3
	// curated categories each, vs English's 23) exhaust and start cycling back through
	// already-known categories much faster than English/German ever did, so waiting for 10
	// consecutive misses left them sitting idle far longer than necessary — confirmed live,
	// French had a 94-minute gap with zero new quotes. Distinct from wikiquoteDeadStreakThreshold,
	// which counts consecutive zero-*quote* page fetches (pages already in the queue yielding
	// nothing), not consecutive *discovery* calls finding nothing new to queue in the first place.
	wikiquoteEmptyStreakBeforeRandom = 2

	// goodreadsEmptyStreakBeforeRandom is Goodreads' equivalent of wikiquoteEmptyStreakBeforeRandom:
	// after this many consecutive tag-cycling attempts in a row add nothing new (every tag in
	// goodreadsTags already seeded at least once — see topUpGoodreadsIfEmpty), fall back to
	// topUpGoodreadsRandomPages once. Goodreads' curated tag list is much shorter than any
	// Wikiquote edition's category list (19 tags vs. tens of categories), so once it's dry it
	// stays dry every single call from then on, not just occasionally — there's no need to wait
	// out a long streak to be confident that's really what's happening.
	goodreadsEmptyStreakBeforeRandom = 3

	// goodreadsRandomPageMax bounds which page of Goodreads' own /quotes "popular quotes" listing
	// topUpGoodreadsRandomPages picks from — confirmed live the listing paginates to page 100
	// (its own next_page chain stops there), and that the exact same div.quote/quoteText/
	// authorOrTitle/tags-footer markup GoodreadsParser already handles for tag and author pages
	// renders here too, unchanged. This is Goodreads' answer to "what happens once even the
	// organically-growing tag graph and the curated fallback list are both fully known": a
	// broad, non-curated batch of ~30 quotes and ~90 tag/author links per page, cutting across
	// whatever's currently popular site-wide rather than the ever-shrinking curated list.
	goodreadsRandomPageMax = 100

	// maxURLRetries bounds how many total attempts a URL gets on a fetch failure before it's
	// marked permanently failed. Previously a single failed fetch (a transient network blip, a
	// momentary 5xx) meant that URL was gone from the crawl forever — no second chance, ever.
	// Only applied to fetch failures, not parse failures or an unknown source: those are
	// near-deterministic given the same page content, so retrying them would just fail the
	// same way again — a fetch failure is the one case that's plausibly transient.
	maxURLRetries = 3

	// wikiquoteExperimentalDelay is a deliberately narrower per-source delay than the proven-safe
	// minSourceDelayBySource entry (6s) — requested explicitly: with fourteen independent
	// Wikiquote editions each running their own goroutine against their own subdomain, any one
	// of them getting rate-limited just means that one source alone permanently widens back to
	// its safe pace for the rest of the run (see Crawler.abandonExperimentalPace) while the
	// other thirteen keep going unaffected — there's no reason for every source to sit at the
	// same cautious pace a single-stream world needed. Every Wikiquote-family worker starts here,
	// not just EN/DE (the original two this was first tried on). Tried 2s briefly at the user's
	// request to be more aggressive, reverted to 4s the same session, then settled on 5s per the
	// user's own live observation of fewer rate-limit hits at that specific pace. Automatically
	// and permanently abandoned per-source the instant a real 429 is observed at this pace — not
	// something a human needs to be watching logs to catch.
	wikiquoteExperimentalDelay = 5 * time.Second
)

// minSourceDelayBySource lets sources that have actually shown throttling be treated more
// cautiously than ones that haven't, rather than applying one flat delay to everything.
// Goodreads is not just marginally more sensitive: confirmed directly (see README) it
// soft-throttles (~60s stalls, still 200 OK) roughly every 10-13 requests regardless of
// pacing, so it gets a meaningfully longer cooldown here — the crawler being polite about
// this shouldn't be diluted by pooling it with Wikiquote's much better-behaved profile
// (only 429s under a genuine zero-delay burst, never throttled at any pace that's been
// tested here). German Wikiquote gets the same treatment as English (same MediaWiki
// software, no throttling observed) — no evidence yet that it needs different treatment.
var minSourceDelayBySource = map[string]time.Duration{
	scoring.SourceGoodreads:   20 * time.Second,
	scoring.SourceWikiquoteEN: 6 * time.Second,
	scoring.SourceWikiquoteDE: 6 * time.Second,
	scoring.SourceWikiquoteFR: 6 * time.Second,
	scoring.SourceWikiquoteES: 6 * time.Second,
	scoring.SourceWikiquoteIT: 6 * time.Second,
	scoring.SourceWikiquotePT: 6 * time.Second,
	scoring.SourceWikiquotePL: 6 * time.Second,
	scoring.SourceWikiquoteSV: 6 * time.Second,
	scoring.SourceWikiquoteRO: 6 * time.Second,
	scoring.SourceWikiquoteCS: 6 * time.Second,
	scoring.SourceWikiquoteHU: 6 * time.Second,
	scoring.SourceWikiquoteDA: 6 * time.Second,
	scoring.SourceWikiquoteNO: 6 * time.Second,
	scoring.SourceWikiquoteFI: 6 * time.Second,
}

func minSourceDelayFor(source string) time.Duration {
	if d, ok := minSourceDelayBySource[source]; ok {
		return d
	}
	return defaultMinSourceDelay
}

// stallPenaltyFor returns goodreadsStallPenalty for Goodreads, wikiquoteStallPenalty for every
// Wikiquote edition — see those constants' doc comments for why the two differ.
func stallPenaltyFor(source string) time.Duration {
	if source == scoring.SourceGoodreads {
		return goodreadsStallPenalty
	}
	return jitter(wikiquoteStallPenalty, 0.5)
}

// stallPenaltyDisplayFor returns the *nominal*, unjittered value for log messages — calling
// stallPenaltyFor twice for one event (once to log it, once to actually apply it) would print a
// different random number than the one really used, since each call draws its own jitter.
func stallPenaltyDisplayFor(source string) string {
	if source == scoring.SourceGoodreads {
		return goodreadsStallPenalty.String()
	}
	return wikiquoteStallPenalty.String() + " (jittered)"
}

// jitter returns d randomly varied by up to ±fraction (e.g. 0.5 → anywhere from 0.5x to 1.5x
// d). Added after live evidence that 12 of 14 independent Wikiquote workers, all sharing the
// same fixed wikiquoteStallPenalty, were retrying in near lockstep against what's almost
// certainly a single rate limit shared across the whole wikiquote.org family — a 429 on one
// tends to mean several others are about to get one too, and a fixed retry delay means they all
// come back for another try at the same moment, repeatedly. Only applied to the Wikiquote stall
// penalty, not Goodreads (a single stream — there's no herd to desynchronize) and not the base
// per-request pace (jittering *that* would just make individual sources slower on average for
// no benefit; the goal here is spreading retries apart, not slowing down the normal case).
func jitter(d time.Duration, fraction float64) time.Duration {
	delta := (rand.Float64()*2 - 1) * fraction
	return time.Duration(float64(d) * (1 + delta))
}

// sleepCtx sleeps for d, or returns early the moment ctx is cancelled — used everywhere
// runWorker would otherwise call time.Sleep, so a graceful shutdown signal doesn't have to wait
// out a full cooldown, stall penalty (up to 60s), or idle poll before actually stopping.
// Returns true if the context was what ended the sleep (caller should stop), false if the full
// duration elapsed normally.
func sleepCtx(ctx context.Context, d time.Duration) bool {
	if d <= 0 {
		return ctx.Err() != nil
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return false
	case <-ctx.Done():
		return true
	}
}

// Log level thresholds, lowest (most restrictive) to highest (most verbose) — see
// configuredLogLevel/SetLogLevel. A message at level L is shown iff L <= configuredLogLevel, so
// "warn" shows both warnings and errors, "info" (the default) shows everything.
const (
	logLevelError = iota
	logLevelWarn
	logLevelInfo
)

// configuredLogLevel defaults to logLevelInfo — full output, exactly today's behavior — so local
// dev/tests are unaffected unless a deployment explicitly opts into a quieter level via
// SetLogLevel/LOG_LEVEL. A package-level var, not a Crawler field: every runWorker goroutine
// reads it, and it's only ever written once, before Run starts.
var configuredLogLevel = logLevelInfo

// SetLogLevel parses "error", "warn" (or "warning"), or "info" (case-insensitive; "" also means
// info, i.e. unset) and applies it — call once before Crawler.Run, from main.go based on
// LOG_LEVEL. Returns an error for anything else so a typo'd env var fails loudly at startup
// instead of silently doing nothing.
func SetLogLevel(level string) error {
	switch strings.ToLower(level) {
	case "", "info":
		configuredLogLevel = logLevelInfo
	case "warn", "warning":
		configuredLogLevel = logLevelWarn
	case "error":
		configuredLogLevel = logLevelError
	default:
		return fmt.Errorf("unknown log level %q (want error, warn, or info)", level)
	}
	return nil
}

// logWarn is log.Printf for a warning: the crawler tried something and skipped/backed off/gave
// up on it (a rejected quote, a low-yield category abandoned, a retry after a transient
// failure) — not a hard error, but the kind of thing an operator watching a quieted-down
// production log still wants to see. Suppressed only at logLevelError.
func logWarn(format string, args ...interface{}) {
	if configuredLogLevel < logLevelWarn {
		return
	}
	log.Printf(format, args...)
}

// logInfo is log.Printf for routine, high-volume narration only — one line per page
// fetched/quote saved/URL discovered, the kind of output that dominates log volume over a long
// run (see PRODUCTION.md). Suppressed at both logLevelWarn and logLevelError. Never used for an
// error, a warning, a stall, a rate-limit, or anything else that should survive a quieted-down
// production log — those all call log.Printf directly, unconditionally, elsewhere in this file.
func logInfo(format string, args ...interface{}) {
	if configuredLogLevel < logLevelInfo {
		return
	}
	log.Printf(format, args...)
}

// quoteMilestoneInterval controls how often the running total gets logged — every 1000 net-new
// quotes actually saved (duplicates don't count; see recordQuotesSaved).
const quoteMilestoneInterval = 1000

// totalQuoteCount is the live running total of quotes in the database, seeded once at startup
// from Store.CountQuotes (see Run) and kept current by recordQuotesSaved after every successful
// save from then on. A package-level atomic, not a Crawler field: every source's worker
// goroutine calls processURL concurrently (see Run spawning one goroutine per source), and an
// atomic add is exactly what's needed to keep a shared counter correct under that without a
// mutex.
var totalQuoteCount atomic.Int64

// recordQuotesSaved adds n newly-saved quotes to the running total and logs every
// quoteMilestoneInterval boundary the addition crosses — one log line per boundary, so a single
// large batch that jumps from, say, 1997 to 2004 still logs the 2000 milestone rather than
// silently skipping over it. Logged with a plain, unconditional log.Printf (like every other
// message in this file meant to survive a quieted-down production log) specifically so this
// still shows up even at LOG_LEVEL=error — a milestone isn't a warning or an error, but it's the
// one piece of "is this thing actually working" narration worth keeping at every log level.
func recordQuotesSaved(n int) {
	if n <= 0 {
		return
	}
	after := totalQuoteCount.Add(int64(n))
	before := after - int64(n)
	first := (before/quoteMilestoneInterval + 1) * quoteMilestoneInterval
	for m := first; m <= after; m += quoteMilestoneInterval {
		log.Printf("Milestone: %d total quotes scraped so far", m)
	}
}

// topUpResult is what a source's top-up function reports back to runWorker. calledNetwork
// distinguishes a real HTTP request to the source (Wikiquote's MediaWiki API calls) from a
// pure DB/Redis operation (Goodreads' tag-seeding, which never calls goodreads.com itself
// during top-up) — only the former should consume this source's per-fetch cooldown slot the
// same way a page fetch does. Found live: consecutive Wikiquote discovery calls (walking past
// several already-fully-known categories, each a fast "0 new URLs" response) were completely
// unthrottled — only the flat idlePollInterval (2s) separated them, not the source's real 6s
// cooldown — and hit a 429 from Wikiquote's API as a direct result. Page fetches never had this
// problem because they were always gated by lastFetch/minDelay; discovery calls bypassed that
// gate entirely by being called from a different branch that didn't update it.
type topUpResult struct {
	added         bool
	calledNetwork bool
	networkFailed bool
	rateLimited   bool // specifically a 429, not just any networkFailed — see fetcher.IsRateLimited
}

type Crawler struct {
	store *db.Store
}

func New(store *db.Store) *Crawler {
	return &Crawler{store: store}
}

// recordWikiquoteYield tracks consecutive zero-quote fetches for one Wikiquote edition.
// Pure — takes the caller's current streak and returns the updated one — rather than a field
// on Crawler, because each edition now runs on its own dedicated worker goroutine (see
// runWorker) with its own local streak variable; there is no shared state left to keep in
// sync, and a shared map here would just reintroduce a data race across goroutines for no
// benefit. After wikiquoteDeadStreakThreshold in a row, it treats the current discovery
// category as low-yield and force-advances that edition's cursor to the next one — otherwise
// a category with a long stretch of non-biographical members (e.g. a topic page like "Black
// people" sitting inside Category:People, or worse, leftover pending URLs from before this
// category-based approach existed) would keep getting ground through one cooldown-interval
// fetch at a time for no benefit. Only the *discovery* cursor moves; URLs already sitting in
// the pending queue from the current low-yield batch still get fetched — there's no per-batch
// tag on frontier rows to selectively drop them, so this only prevents drawing *more* of the
// same bad category next time, not clearing what's already queued.
func (c *Crawler) recordWikiquoteYield(ctx context.Context, site wikiquoteSite, deadStreak int, gotQuotes bool) int {
	if gotQuotes {
		return 0
	}
	deadStreak++
	if deadStreak < wikiquoteDeadStreakThreshold {
		return deadStreak
	}

	raw, err := c.store.GetDiscoveryCursor(ctx, site.source)
	if err != nil {
		log.Printf("Could not load %s discovery cursor to skip a low-yield category: %s\n", site.source, err)
		return 0
	}
	cursor := decodeWikiquoteCursor(raw)
	// Same out-of-range guard topUpWikiquoteSiteIfEmpty already applies when *reading* a
	// cursor — needed here too, on the *write* path, or a run of dead-streak skips can push
	// CategoryIndex arbitrarily far past the curated list's length before the next top-up call
	// happens to catch and reset it. Purely cosmetic in the meantime (topUp's own guard means
	// nothing actually gets stuck), but it did make this log line print a useless "?" instead
	// of ever wrapping back to a real category name — found live, every one of those "?"s
	// traced back to exactly this.
	if cursor.CategoryIndex >= len(site.curatedCategories) {
		cursor = wikiquoteDiscoveryCursor{}
	}
	skipped := cursor.Current
	if skipped == "" && cursor.CategoryIndex < len(site.curatedCategories) {
		skipped = site.curatedCategories[cursor.CategoryIndex]
	}
	if skipped == "" {
		skipped = "?"
	}
	// Abandon the whole top-level branch, not just wherever we happened to be within it
	// (possibly deep in a subcategory) — a persistently low-yield area isn't worth resuming
	// elsewhere inside the same branch, only worth escaping entirely.
	next := wikiquoteDiscoveryCursor{CategoryIndex: cursor.CategoryIndex + 1}
	if err := c.store.SetDiscoveryCursor(ctx, site.source, next.encode()); err != nil {
		log.Printf("Could not save %s discovery cursor after skipping a low-yield category: %s\n", site.source, err)
		return 0
	}
	logWarn("%s: %d consecutive pages with 0 quotes — skipping the rest of category %q for next time", site.source, wikiquoteDeadStreakThreshold, skipped)
	return 0
}

// topUpWikiquoteSiteIfEmpty checks whether the given Wikiquote edition has any pending work;
// if not, fetches the next batch of one of its curated categories via the MediaWiki API and
// seeds it. Returns true if new work was actually added. This is what keeps a Wikiquote
// edition from running dry mid-session — the fixed stopgap seed list (English only) only
// lasts ~20 pages, and SeedFrontier only runs once at startup, so without this the crawler
// would just sit idle once that list was consumed, even with real content still available to
// discover. German has no stopgap seed list at all — it bootstraps entirely from this the
// first time it's idle, the same as Goodreads' tag fallback does.
//
// Categories over blind alphabetical enumeration: filters out the large fraction of Wikiquote
// articles that are never going to have quotes (movies, TV shows, books, historical events)
// by only walking pages Wikiquote itself has tagged under an occupation — confirmed live to
// meaningfully reduce "0 quotes, 0 discovered URLs" dead-end fetches.
//
// Once every curated category is fully walked, the cursor wraps back to the first one and
// starts over — Wikiquote gains new articles over time, so a full pass eventually finds fresh
// content again; in the meantime it's a cheap no-op (ON CONFLICT DO NOTHING skips everything
// already known, so `added` stays 0 and the caller's dead-end fallback — see
// topUpGoodreadsIfEmpty — takes over instead of this looping forever on stale data).
func (c *Crawler) topUpWikiquoteSiteIfEmpty(ctx context.Context, site wikiquoteSite) topUpResult {
	pending, err := c.store.CountPendingBySource(ctx, site.source)
	if err != nil {
		log.Printf("Could not check %s pending count: %s\n", site.source, err)
		return topUpResult{}
	}
	if pending >= minFrontierBuffer {
		return topUpResult{}
	}

	raw, err := c.store.GetDiscoveryCursor(ctx, site.source)
	if err != nil {
		log.Printf("Could not load %s discovery cursor: %s\n", site.source, err)
		return topUpResult{}
	}
	cursor := decodeWikiquoteCursor(raw)
	if cursor.CategoryIndex >= len(site.curatedCategories) {
		logInfo("%s discovery: finished all %d curated categories (and their subcategories), restarting from the beginning", site.source, len(site.curatedCategories))
		cursor = wikiquoteDiscoveryCursor{}
	}

	category := cursor.Current
	if category == "" {
		category = site.curatedCategories[cursor.CategoryIndex]
	}

	// One call returns both category's own member pages and its direct subcategories — see
	// fetchWikiquoteCategoryMembers for why this is one request, not two.
	pages, subcats, nextCMContinue, err := fetchWikiquoteCategoryMembers(ctx, site, category, cursor.CMContinue)
	if err != nil {
		log.Printf("%s title discovery failed (category=%q): %s — backing off ~%s (jittered)\n", site.source, category, err, wikiquoteStallPenalty)
		return topUpResult{calledNetwork: true, networkFailed: true, rateLimited: fetcher.IsRateLimited(err)}
	}

	visited := make(map[string]bool, len(cursor.Visited))
	for _, v := range cursor.Visited {
		visited[v] = true
	}
	queue := append([]string{}, cursor.Queue...)
	var newlyQueued []string
	for _, sc := range subcats {
		if visited[sc] {
			continue
		}
		visited[sc] = true
		queue = append(queue, sc)
		newlyQueued = append(newlyQueued, sc)
	}
	if len(newlyQueued) > 0 {
		logInfo("%s discovery: category %q has %d new subcategory(ies) queued to explore (e.g. %q)", site.source, category, len(newlyQueued), newlyQueued[0])
	}
	updatedVisited := make([]string, 0, len(visited))
	for v := range visited {
		updatedVisited = append(updatedVisited, v)
	}

	var next wikiquoteDiscoveryCursor
	switch {
	case nextCMContinue != "":
		// Category still paginating — stay on it, carrying the (possibly just-grown) queue
		// forward so subcategories found on this page aren't lost before the category finishes.
		next = wikiquoteDiscoveryCursor{
			CategoryIndex: cursor.CategoryIndex,
			Current:       category,
			CMContinue:    nextCMContinue,
			Queue:         queue,
			Visited:       updatedVisited,
		}
	case len(queue) > 0:
		// This category (both its pages and its own subcategories) is fully known — descend
		// into the next queued subcategory instead of moving to the next top-level category,
		// which is what turns a fixed curated-category list into real coverage of Wikiquote's
		// actual category tree. Confirmed live: Category:Writers, already fully mined at the
		// top level, has real, on-topic subcategories like "Gay writers" and "Writers by
		// language" that a flat list never reaches.
		next = wikiquoteDiscoveryCursor{
			CategoryIndex: cursor.CategoryIndex,
			Current:       queue[0],
			Queue:         queue[1:],
			Visited:       updatedVisited,
		}
	default:
		// Nothing left anywhere in this top-level category's subtree — move on.
		logInfo("%s discovery: category %q and all its subcategories are fully explored, moving to the next curated category", site.source, category)
		next = wikiquoteDiscoveryCursor{CategoryIndex: cursor.CategoryIndex + 1}
	}
	if err := c.store.SetDiscoveryCursor(ctx, site.source, next.encode()); err != nil {
		log.Printf("Could not save %s discovery cursor: %s\n", site.source, err)
	}

	if len(pages) == 0 {
		logInfo("%s discovery: category %q returned no member pages (%d subcategories queued)", site.source, category, len(newlyQueued))
		return topUpResult{calledNetwork: true}
	}

	priority := scoring.CalculatePriority(site.source, 0, 0)
	urls := make([]string, len(pages))
	for i, title := range pages {
		urls[i] = wikiquoteTitleToURL(site, title)
	}

	// One batched INSERT + one batched ZADD for up to 500 URLs, instead of 500 of each awaited
	// one at a time — the discovery batch size is exactly the case that made the old per-title
	// loop expensive (~1000 sequential round-trips per top-up).
	inserted, err := c.store.SaveURLsBatch(ctx, urls, site.source, priority, 0)
	if err != nil {
		log.Printf("Could not save discovered %s URLs: %s\n", site.source, err)
		return topUpResult{calledNetwork: true}
	}
	if len(inserted) == 0 {
		logInfo("%s discovery: category %q — fetched %d pages, added 0 new URLs to the frontier (all already known)", site.source, category, len(pages))
		return topUpResult{calledNetwork: true}
	}
	if err := c.store.PushURLsBatch(ctx, site.source, inserted, priority); err != nil {
		log.Printf("Could not push discovered %s URLs to frontier: %s\n", site.source, err)
		return topUpResult{calledNetwork: true}
	}
	for _, u := range inserted {
		logInfo("Discovered URL [%s]: %s (via category %q)", site.source, u, category)
	}

	logInfo("%s discovery: category %q — fetched %d pages, added %d new URLs to the frontier", site.source, category, len(pages), len(inserted))
	return topUpResult{added: true, calledNetwork: true}
}

// topUpWikiquoteRandomPages is the dead-end fallback for a Wikiquote edition: fetches a batch
// of genuinely random article titles instead of walking the curated category tree. Called by
// runWikiquoteWorker (see Run) after wikiquoteEmptyStreakBeforeRandom consecutive top-up calls
// in a row added nothing — confirmed live this is a real, not hypothetical, scenario (German
// Wikiquote's queue emptied out mid-way through a large already-mostly-known subcategory
// branch). Doesn't touch the category-walk cursor at all — it's a one-off injection of extra
// candidate URLs on top of, not a replacement for, the normal discovery cursor, which resumes
// exactly where it left off on the next call once this fallback returns.
func (c *Crawler) topUpWikiquoteRandomPages(ctx context.Context, site wikiquoteSite) topUpResult {
	titles, err := fetchWikiquoteRandomPages(ctx, site)
	if err != nil {
		log.Printf("%s random-page fallback failed: %s — backing off ~%s (jittered)\n", site.source, err, wikiquoteStallPenalty)
		return topUpResult{calledNetwork: true, networkFailed: true, rateLimited: fetcher.IsRateLimited(err)}
	}
	if len(titles) == 0 {
		logWarn("%s random-page fallback returned no titles", site.source)
		return topUpResult{calledNetwork: true}
	}

	priority := scoring.CalculatePriority(site.source, 0, 0)
	urls := make([]string, len(titles))
	for i, title := range titles {
		urls[i] = wikiquoteTitleToURL(site, title)
	}

	inserted, err := c.store.SaveURLsBatch(ctx, urls, site.source, priority, 0)
	if err != nil {
		log.Printf("Could not save random %s URLs: %s\n", site.source, err)
		return topUpResult{calledNetwork: true}
	}
	if len(inserted) == 0 {
		logInfo("%s random-page fallback: fetched %d titles, added 0 new URLs (all already known)", site.source, len(titles))
		return topUpResult{calledNetwork: true}
	}
	if err := c.store.PushURLsBatch(ctx, site.source, inserted, priority); err != nil {
		log.Printf("Could not push random %s URLs to frontier: %s\n", site.source, err)
		return topUpResult{calledNetwork: true}
	}
	for _, u := range inserted {
		logInfo("Discovered URL [%s]: %s (via random-page fallback)", site.source, u)
	}

	logInfo("%s random-page fallback: fetched %d titles, added %d new URLs to the frontier", site.source, len(titles), len(inserted))
	return topUpResult{added: true, calledNetwork: true}
}

// goodreadsTags is a curated fallback list of additional Goodreads quote tags, used only once
// the single seeded tag ("inspirational") genuinely runs dry — its pagination is finite (its
// own "next" link disappears on the last page), unlike Wikiquote's much larger discoverable
// corpus. Confirmed live to exist and return real quote content during source research.
var goodreadsTags = []string{
	"inspirational", "life", "love", "wisdom", "happiness", "success", "philosophy",
	"motivational", "truth", "humor", "knowledge", "friendship", "books", "writing",
	"courage", "hope", "faith", "dreams", "change",
}

// topUpGoodreadsIfEmpty checks whether Goodreads has any pending work; if not, seeds the next
// tag from goodreadsTags (cycling back to the start once exhausted — a cheap no-op via
// ON CONFLICT DO NOTHING if that tag's pagination was already fully crawled, not a real
// problem). This is the dead-end fallback: if both sources' primary discovery genuinely have
// nothing new right now, this is what keeps the crawler finding real work instead of just
// idling forever.
// topUpGoodreadsIfEmpty never sets calledNetwork on its topUpResult — unlike Wikiquote's
// top-up, this only ever touches Postgres/Redis (seeding a tag URL for the normal fetch loop
// to pick up later); it doesn't fetch goodreads.com itself, so it shouldn't consume Goodreads'
// per-fetch cooldown slot the way a real request would.
func (c *Crawler) topUpGoodreadsIfEmpty(ctx context.Context) topUpResult {
	pending, err := c.store.CountPendingBySource(ctx, scoring.SourceGoodreads)
	if err != nil {
		log.Printf("Could not check Goodreads pending count: %s\n", err)
		return topUpResult{}
	}
	if pending > 0 {
		return topUpResult{}
	}

	idx := 0
	if raw, err := c.store.GetDiscoveryCursor(ctx, scoring.SourceGoodreads); err == nil && raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			idx = n % len(goodreadsTags)
		}
	}
	tag := goodreadsTags[idx]
	if err := c.store.SetDiscoveryCursor(ctx, scoring.SourceGoodreads, strconv.Itoa((idx+1)%len(goodreadsTags))); err != nil {
		log.Printf("Could not save Goodreads discovery cursor: %s\n", err)
	}

	tagURL := "https://www.goodreads.com/quotes/tag/" + tag
	priority := scoring.CalculatePriority(scoring.SourceGoodreads, 0, 0)
	frontier := models.URLFrontier{URL: tagURL, Source: scoring.SourceGoodreads, Priority: priority}
	inserted, err := c.store.SaveURL(ctx, frontier)
	if err != nil {
		log.Printf("Could not save Goodreads tag seed: %s\n", err)
		return topUpResult{}
	}
	if !inserted {
		logInfo("Goodreads tag %q already fully known; will try the next one on the next dead end", tag)
		return topUpResult{}
	}
	if err := c.store.PushURL(ctx, scoring.SourceGoodreads, tagURL, priority); err != nil {
		log.Printf("Could not push Goodreads tag seed to frontier: %s\n", err)
		return topUpResult{}
	}
	logInfo("Discovered URL [goodreads]: %s (new tag seeded — the previous one had run dry)", tagURL)
	return topUpResult{added: true}
}

// topUpGoodreadsRandomPages is Goodreads' equivalent of topUpWikiquoteRandomPages: the dead-end
// fallback once even topUpGoodreadsIfEmpty's tag cycling stops finding anything new (every tag
// in goodreadsTags already seeded — see goodreadsEmptyStreakBeforeRandom). Rather than a
// MediaWiki list=random call (Goodreads has no equivalent API), this seeds a random page of
// https://www.goodreads.com/quotes — the site's own "popular quotes" listing, which paginates to
// goodreadsRandomPageMax and renders each quote with the exact same markup GoodreadsParser
// already parses for tag/author pages (confirmed live), so no parser changes are needed: the
// normal fetch loop picks this URL up like any other Goodreads URL, and its own NextURLs (tags
// and author links, same as any other page) feed straight back into the organic discovery this
// is backing up. Like topUpGoodreadsIfEmpty, this never touches goodreads.com itself (only
// Postgres/Redis via SaveURL/PushURL), so topUpResult.calledNetwork stays false here too.
func (c *Crawler) topUpGoodreadsRandomPages(ctx context.Context) topUpResult {
	page := rand.Intn(goodreadsRandomPageMax) + 1
	pageURL := "https://www.goodreads.com/quotes"
	if page > 1 {
		pageURL = fmt.Sprintf("https://www.goodreads.com/quotes?page=%d", page)
	}

	priority := scoring.CalculatePriority(scoring.SourceGoodreads, 0, 0)
	frontier := models.URLFrontier{URL: pageURL, Source: scoring.SourceGoodreads, Priority: priority}
	inserted, err := c.store.SaveURL(ctx, frontier)
	if err != nil {
		log.Printf("Could not save Goodreads random-page seed: %s\n", err)
		return topUpResult{}
	}
	if !inserted {
		logInfo("Goodreads random page %d already known; will try another on the next dead end", page)
		return topUpResult{}
	}
	if err := c.store.PushURL(ctx, scoring.SourceGoodreads, pageURL, priority); err != nil {
		log.Printf("Could not push Goodreads random-page seed to frontier: %s\n", err)
		return topUpResult{}
	}
	logInfo("Discovered URL [goodreads]: %s (random popular-quotes page — tag cycling had run dry)", pageURL)
	return topUpResult{added: true}
}

// goodreadsTopUpFunc returns a topUp closure for Goodreads: the normal tag-cycling fallback
// (topUpGoodreadsIfEmpty), falling back to a random popular-quotes page
// (topUpGoodreadsRandomPages) once goodreadsEmptyStreakBeforeRandom consecutive calls in a row
// find nothing new — the same shape as wikiquoteTopUpFunc. emptyStreak is local to this closure,
// one per Crawler.Run call, matching how Goodreads only ever runs one worker.
//
// Unlike Wikiquote's topUpResult.calledNetwork (which distinguishes "didn't even try" from "tried
// and found nothing" for free, since a real API call either happens or doesn't),
// topUpGoodreadsIfEmpty never sets calledNetwork — by design, it only ever touches Postgres/Redis
// (see its own doc comment on why that shouldn't consume Goodreads' fetch cooldown). So this
// closure checks Goodreads' own pending count directly before deferring to topUpGoodreadsIfEmpty:
// a nonzero pending count means there's genuinely nothing to top up right now, not evidence the
// tag list is exhausted, and must not count toward the streak — otherwise, since Goodreads
// realistically never holds anywhere near minFrontierBuffer (20) pending URLs at once (a single
// pagination chain plus occasional tag seeds), runWorker would call this on nearly every idle
// tick regardless of whether Goodreads is anywhere close to actually running dry.
func (c *Crawler) goodreadsTopUpFunc() func(ctx context.Context) topUpResult {
	var emptyStreak int
	return func(ctx context.Context) topUpResult {
		pending, err := c.store.CountPendingBySource(ctx, scoring.SourceGoodreads)
		if err != nil {
			log.Printf("Could not check Goodreads pending count: %s\n", err)
			return topUpResult{}
		}
		if pending > 0 {
			return topUpResult{}
		}

		result := c.topUpGoodreadsIfEmpty(ctx)
		if result.added {
			emptyStreak = 0
			return result
		}
		emptyStreak++
		if emptyStreak >= goodreadsEmptyStreakBeforeRandom {
			emptyStreak = 0
			logWarn("goodreads: %d consecutive tag-cycling attempts found nothing new — falling back to a random popular-quotes page", goodreadsEmptyStreakBeforeRandom)
			return c.topUpGoodreadsRandomPages(ctx)
		}
		return result
	}
}

// failOrRetry handles a fetch failure for row: if it hasn't yet used up maxURLRetries attempts,
// it's requeued to pending with an incremented error_count and a correspondingly lower priority
// (scoring.CalculatePriority's existing errorCount term means a retried URL sinks below fresh
// ones in its own source's queue, rather than competing evenly with them) and pushed back onto
// source's Redis queue so it's actually picked up again. Once retries are exhausted, it's
// marked permanently failed via the existing MarkURLFailed, same as before this existed.
func (c *Crawler) failOrRetry(ctx context.Context, source string, row models.URLFrontier) {
	nextErrorCount := row.ErrorCount + 1
	if nextErrorCount >= maxURLRetries {
		if err := c.store.MarkURLFailed(ctx, row.URL); err != nil {
			log.Printf("[%s] Could not mark the URL failed: %s\n", source, err)
		}
		log.Printf("[%s] Giving up on %s after %d attempts", source, row.URL, nextErrorCount)
		return
	}

	priority := scoring.CalculatePriority(source, int(row.Depth), int(nextErrorCount))
	if err := c.store.RetryURL(ctx, row.URL, nextErrorCount, priority); err != nil {
		log.Printf("[%s] Could not requeue %s for retry: %s\n", source, row.URL, err)
		return
	}
	if err := c.store.PushURL(ctx, source, row.URL, priority); err != nil {
		log.Printf("[%s] Could not push %s back to the frontier for retry: %s\n", source, row.URL, err)
		return
	}
	logWarn("[%s] Will retry %s (attempt %d of %d)", source, row.URL, nextErrorCount+1, maxURLRetries)
}

// processURL fetches, parses, and saves everything for one URL — identical work regardless of
// which source's worker goroutine calls it. Returns gotQuotes (fed into a Wikiquote worker's
// dead-streak circuit breaker; always false for Goodreads, which ignores it), stalled (true if
// the fetch was slow or failed outright, telling the caller to back this source's cooldown off
// to stallPenaltyFor(source) instead of just its normal minDelay for the next iteration), and rateLimited
// (specifically a 429, as opposed to any other failure — see fetcher.IsRateLimited — which
// tells a worker running at wikiquoteExperimentalDelay to permanently abandon that pace).
func (c *Crawler) processURL(ctx context.Context, source string, url string) (gotQuotes bool, stalled bool, rateLimited bool) {
	// Defense-in-depth against MediaWiki red links (see parser.resolveWikiquoteLink, which
	// already stops new ones from ever being queued): this still catches any row that was
	// queued *before* that fix shipped and is only now being popped off the frontier. Without
	// this, every one of those stale rows would burn a real network round-trip, a guaranteed
	// 404, the full stall backoff, and all maxURLRetries attempts — for a URL whose own query
	// string already says it can never resolve to content. Short-circuiting straight to
	// MarkURLFailed (no fetch, no retry, no backoff) flushes that backlog for free the moment
	// each row is next popped, instead of paying the same wasted cost repeatedly.
	if strings.Contains(url, "redlink=1") {
		if err := c.store.MarkURLFailed(ctx, url); err != nil {
			log.Printf("[%s] Could not mark red-link URL %s failed: %s\n", source, url, err)
		}
		log.Printf("[%s] Skipping known-dead red link (queued before the discovery fix): %s", source, url)
		return false, false, false
	}

	row, err := c.store.GetURLByURL(ctx, url)
	if err != nil {
		log.Printf("[%s] Could not look up URL %s: %s\n", source, url, err)
		return false, false, false
	}

	if err := c.store.MarkURLInProgress(ctx, url); err != nil {
		log.Printf("[%s] Could not mark the URL: %s\n", source, err)
		return false, false, false
	}

	fetchStart := time.Now()
	html, err := fetcher.Fetch(ctx, url)
	if elapsed := time.Since(fetchStart); elapsed > slowFetchWarn {
		log.Printf("Slow fetch: %s (source=%s) took %s — likely soft rate-limited by the source; backing off ~%s", url, source, elapsed.Round(time.Second), stallPenaltyDisplayFor(source))
		stalled = true
	}
	if err != nil {
		log.Printf("Fetch failed for %s (source=%s): %s — backing off ~%s", url, source, err, stallPenaltyDisplayFor(source))
		stalled = true
		c.failOrRetry(ctx, source, row)
		return false, stalled, fetcher.IsRateLimited(err)
	}

	var p parser.Parser
	switch source {
	case scoring.SourceGoodreads:
		p = &parser.GoodreadsParser{}
	case scoring.SourceWikiquoteEN:
		p = &parser.WikiquoteParser{}
	case scoring.SourceWikiquoteDE:
		p = &parser.GermanWikiquoteParser{}
	case scoring.SourceWikiquoteFR:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquoteFR, Language: "fr", ExcludedHeadingPrefixes: parser.WikiquoteFRExcludedHeadingPrefixes}
	case scoring.SourceWikiquoteES:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquoteES, Language: "es", ExcludedHeadingPrefixes: parser.WikiquoteESExcludedHeadingPrefixes}
	case scoring.SourceWikiquoteIT:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquoteIT, Language: "it", ExcludedHeadingPrefixes: parser.WikiquoteITExcludedHeadingPrefixes}
	case scoring.SourceWikiquotePT:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquotePT, Language: "pt", ExcludedHeadingPrefixes: parser.WikiquotePTExcludedHeadingPrefixes}
	case scoring.SourceWikiquotePL:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquotePL, Language: "pl", ExcludedHeadingPrefixes: parser.WikiquotePLExcludedHeadingPrefixes}
	case scoring.SourceWikiquoteSV:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquoteSV, Language: "sv", ExcludedHeadingPrefixes: parser.WikiquoteSVExcludedHeadingPrefixes}
	case scoring.SourceWikiquoteRO:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquoteRO, Language: "ro", ExcludedHeadingPrefixes: parser.WikiquoteROExcludedHeadingPrefixes}
	case scoring.SourceWikiquoteCS:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquoteCS, Language: "cs", ExcludedHeadingPrefixes: parser.WikiquoteCSExcludedHeadingPrefixes}
	case scoring.SourceWikiquoteHU:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquoteHU, Language: "hu", ExcludedHeadingPrefixes: parser.WikiquoteHUExcludedHeadingPrefixes}
	case scoring.SourceWikiquoteDA:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquoteDA, Language: "da", ExcludedHeadingPrefixes: parser.WikiquoteDAExcludedHeadingPrefixes}
	case scoring.SourceWikiquoteNO:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquoteNO, Language: "no", ExcludedHeadingPrefixes: parser.WikiquoteNOExcludedHeadingPrefixes}
	case scoring.SourceWikiquoteFI:
		p = &parser.LocalizedWikiquoteParser{Source: scoring.SourceWikiquoteFI, Language: "fi", ExcludedHeadingPrefixes: parser.WikiquoteFIExcludedHeadingPrefixes}
	default:
		log.Printf("Unknown source: %s\n", source)
		if err := c.store.MarkURLFailed(ctx, url); err != nil {
			log.Printf("[%s] Could not mark the URL: %s\n", source, err)
		}
		return false, stalled, false
	}

	result, err := p.Parse(html)
	if err != nil {
		log.Printf("[%s] Could not parse the URL: %s\n", source, err)
		if err := c.store.MarkURLFailed(ctx, url); err != nil {
			log.Printf("[%s] Could not mark the URL: %s\n", source, err)
		}
		return false, stalled, false
	}
	logInfo("Parsed %s (source=%s): found %d quotes, %d discovered URLs", url, source, len(result.Quotes), len(result.NextURLs))

	// Quality-filtered first, saved second: filtering is pure/local (no DB round trip either
	// way), but batching the actual save matters — a single Goodreads page yields ~30 quotes,
	// previously 30 separate INSERT round trips (measured live: ~99ms) collapsed into one
	// (measured live: ~30ms, and the gap only widens with real network latency to Postgres,
	// unlike this same-host localhost comparison).
	var candidates []models.Quote
	for _, quote := range result.Quotes {
		quote.SourceURL = url
		if !dedup.IsLatinScript(quote.Text) {
			logWarn("Skipped non-Latin-script quote [%s]: %q — %s", quote.Source, truncate(quote.Text, 40), quote.Author)
			continue
		}
		if dedup.IsTooShort(quote.Text) {
			logWarn("Skipped quote under %d characters [%s]: %q — %s", dedup.MinQuoteLength, quote.Source, quote.Text, quote.Author)
			continue
		}
		if dedup.LooksLikeDictionaryEntry(quote.Text) {
			logWarn("Skipped dictionary-style entry [%s]: %q — %s", quote.Source, truncate(quote.Text, 40), quote.Author)
			continue
		}
		if dedup.LooksLikeWikiDiscussion(quote.Text) {
			logWarn("Skipped wiki discussion/signature content [%s]: %q — %s", quote.Source, truncate(quote.Text, 40), quote.Author)
			continue
		}
		if !dedup.MatchesClaimedLanguage(quote.Text, quote.Language) {
			logWarn("Skipped quote not actually in its claimed language %q [%s]: %q — %s", quote.Language, quote.Source, truncate(quote.Text, 40), quote.Author)
			continue
		}
		candidates = append(candidates, quote)
	}

	if len(candidates) > 0 {
		saved, err := c.store.SaveQuotes(ctx, candidates)
		if err != nil {
			log.Printf("Could not save quotes: %s\n", err)
		} else {
			newlySaved := 0
			for i, quote := range candidates {
				if saved[i] {
					newlySaved++
					logInfo("Saved quote [%s]: %q — %s", quote.Source, truncate(quote.Text, 60), quote.Author)
				} else {
					logWarn("Skipped duplicate [%s]: %q — %s", quote.Source, truncate(quote.Text, 60), quote.Author)
				}
			}
			recordQuotesSaved(newlySaved)
		}
	}

	if len(result.NextURLs) > 0 {
		// Batched INSERT + batched ZADD, same as the discovery top-up paths — citation-link
		// extraction can surface dozens of URLs per page, not the 0-1 a per-URL round-trip
		// loop was originally sized for.
		priority := scoring.CalculatePriority(source, int(row.Depth)+1, 0)
		inserted, err := c.store.SaveURLsBatch(ctx, result.NextURLs, source, priority, row.Depth+1)
		if err != nil {
			log.Printf("Could not save discovered URLs: %s\n", err)
		} else if len(inserted) > 0 {
			if err := c.store.PushURLsBatch(ctx, source, inserted, priority); err != nil {
				log.Printf("Could not push discovered URLs to frontier: %s\n", err)
			} else {
				for _, u := range inserted {
					logInfo("Discovered URL [%s]: %s (from %s)", source, u, url)
				}
			}
		}
	}

	if err := c.store.MarkURLDone(ctx, url); err != nil {
		log.Printf("Could not mark the URL as done: %s\n", err)
	}

	return len(result.Quotes) > 0, stalled, false
}

// runWorker drives one source's fetch loop independently, forever, on its own goroutine — the
// fix for the crawler previously being single-threaded across all sources. Before this, every
// source shared one loop: a single slow or stalled fetch (Goodreads' ~60s soft-throttle tarpit
// is the known example) blocked the whole process, including a different source's fetch that
// was already off cooldown and ready to go. Cooldown (lastFetch) and, for Wikiquote editions,
// the dead-streak circuit breaker are both plain local variables now instead of fields shared
// across sources — each is only ever touched by the one goroutine that owns it, so there's
// nothing to lock. topUp is called whenever this source's queue is empty (nil for a source
// with no top-up mechanism); onResult, if non-nil, is handed whether the fetch yielded any
// quotes, for the Wikiquote dead-streak logic to update its own local streak.
//
// Every wait point uses sleepCtx instead of time.Sleep and checks its result (or ctx.Err()
// directly), so cancelling ctx (graceful shutdown — see Run) stops this loop within roughly one
// in-flight fetch, not after waiting out whatever cooldown or stall penalty happened to be
// pending. fetcher.Fetch itself is also ctx-aware, so even a fetch already in flight when
// shutdown is requested gets cut short instead of running out its full 90s timeout.
//
// topUp's calledNetwork/networkFailed (see topUpResult) update lastFetch exactly like a page
// fetch would — found live that without this, consecutive Wikiquote discovery calls (each its
// own real HTTP request to the MediaWiki API) had no cooldown between them at all beyond the
// flat idlePollInterval, and a run of several already-exhausted categories in a row hit a 429
// as a direct result. Goodreads' top-up never sets calledNetwork (it only touches
// Postgres/Redis), so it correctly never eats into Goodreads' cooldown for no reason.
//
// minDelay starts as whatever the caller passes in (the proven-safe value for Goodreads, or
// the deliberately narrower wikiquoteExperimentalDelay for a Wikiquote worker) but is a plain
// local variable, not a fixed parameter — abandonExperimentalPace can permanently widen it mid-run
// the instant a real 429 shows up, without needing any state shared outside this one goroutine.
func (c *Crawler) runWorker(ctx context.Context, source string, minDelay time.Duration, topUp func(ctx context.Context) topUpResult, onResult func(gotQuotes bool)) {
	// A random startup stagger for every Wikiquote worker (not Goodreads — a single stream has
	// no herd to desynchronize) — found live: all fourteen goroutines start in the same instant,
	// so their very first discovery call collides immediately, before any retry jitter ever gets
	// a chance to matter (confirmed live at startup, twice: three editions 429'd within the same
	// second with a 5s spread window; still five within the same second after widening to that
	// 5s window, given ~12 sources landing across it — bumped to 15s for a meaningfully lower
	// per-second collision rate). Spreads the *first* attempt out instead of firing them all at
	// once; doesn't eliminate the underlying shared rate limit, just reduces how often several
	// sources' first requests land in the same instant.
	if source != scoring.SourceGoodreads {
		if sleepCtx(ctx, time.Duration(rand.Float64()*float64(15*time.Second))) {
			return
		}
	}

	var lastFetch time.Time
	for {
		if ctx.Err() != nil {
			return
		}

		if !lastFetch.IsZero() {
			if wait := minDelay - time.Since(lastFetch); wait > 0 {
				if sleepCtx(ctx, wait) {
					return
				}
			}
		}

		// Aggressive-fill: below minFrontierBuffer, try topUp *before* checking whether
		// there's already something pending to fetch, not only once the queue is fully
		// empty — see that constant's doc comment. topUp itself still correctly no-ops
		// (Goodreads: pending > 0; Wikiquote: pending >= minFrontierBuffer) so this is a
		// harmless extra check once a source's buffer is actually healthy, and for Goodreads
		// specifically (a single pagination chain, never meant to hold many pending URLs at
		// once) it's always a no-op past its own gate.
		if topUp != nil {
			pending, err := c.store.CountPendingBySource(ctx, source)
			if err != nil {
				log.Printf("[%s] Could not check pending count: %s\n", source, err)
			} else if pending < minFrontierBuffer {
				result := topUp(ctx)
				if result.calledNetwork {
					if result.networkFailed {
						lastFetch = time.Now().Add(stallPenaltyFor(source) - minDelay)
						if result.rateLimited {
							minDelay = c.abandonExperimentalPace(source, minDelay)
						}
					} else {
						lastFetch = time.Now()
					}
					continue
				}
				// topUp had nothing to add this round (already at its own limit, or a
				// genuine no-op) — fall through and fetch whatever's already pending instead
				// of idling, so quote processing keeps going while the buffer rebuilds.
			}
		}

		url, err := c.store.PopURL(ctx, source)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[%s] Could not get the next URL: %s\n", source, err)
			if sleepCtx(ctx, errorBackoff) {
				return
			}
			continue
		}
		if url == "" {
			if topUp != nil {
				result := topUp(ctx)
				if result.calledNetwork {
					if result.networkFailed {
						lastFetch = time.Now().Add(stallPenaltyFor(source) - minDelay)
						if result.rateLimited {
							minDelay = c.abandonExperimentalPace(source, minDelay)
						}
					} else {
						lastFetch = time.Now()
					}
					// A real network request was just made (whether it found new work, found
					// nothing, or failed) — the per-source cooldown just set above is what
					// paces the next one; piling idlePollInterval on top of it here was pure
					// waste, and it's exactly this wasted gap that made a chain of empty
					// categories/subcategories (recursive discovery, see wikiquote_discovery.go)
					// feel needlessly slow. Loop straight back to the top-of-loop cooldown wait
					// instead of sleeping twice.
					continue
				}
				if result.added {
					continue
				}
			}
			if sleepCtx(ctx, idlePollInterval) {
				return
			}
			continue
		}

		lastFetch = time.Now()
		gotQuotes, stalled, rateLimited := c.processURL(ctx, source, url)
		if stalled {
			lastFetch = lastFetch.Add(stallPenaltyFor(source) - minDelay)
			if rateLimited {
				minDelay = c.abandonExperimentalPace(source, minDelay)
			}
		}
		if onResult != nil {
			onResult(gotQuotes)
		}
	}
}

// abandonExperimentalPace permanently widens a source's cooldown from an experimental pace
// (wikiquoteExperimentalDelay) up to its normal, proven-safe one (minSourceDelayFor) the first
// time a real 429 is observed at the faster pace — an automatic, one-way safety net for the
// bounded pacing experiment, so a rate-limit signal doesn't require a human watching logs to
// react to it. Only ever widens, never narrows back within the same process run: once real
// evidence of rate-limiting shows up, there's no reason to risk finding it again in the same
// run. A no-op if current is already at or above the safe pace (e.g. Goodreads, which never
// runs at an experimental pace to begin with).
func (c *Crawler) abandonExperimentalPace(source string, current time.Duration) time.Duration {
	safe := minSourceDelayFor(source)
	if current >= safe {
		return current
	}
	log.Printf("[%s] Got rate-limited at the experimental %s pace — reverting to the proven-safe %s for the rest of this run", source, current, safe)
	return safe
}

// wikiquoteTopUpFunc returns a topUp closure for site: the normal curated-category walk
// (topUpWikiquoteSiteIfEmpty), falling back to a batch of genuinely random pages
// (topUpWikiquoteRandomPages) once wikiquoteEmptyStreakBeforeRandom consecutive calls in a row
// find nothing new to queue. emptyStreak is local to this closure (one per site, since each
// Wikiquote edition's worker gets its own call to this function) — only counts calls that
// actually completed without a network error; a failed/rate-limited attempt isn't evidence the
// category tree is exhausted, so it shouldn't push the streak toward triggering the fallback.
func (c *Crawler) wikiquoteTopUpFunc(site wikiquoteSite) func(ctx context.Context) topUpResult {
	var emptyStreak int
	return func(ctx context.Context) topUpResult {
		result := c.topUpWikiquoteSiteIfEmpty(ctx, site)
		if result.added {
			emptyStreak = 0
			return result
		}
		if result.calledNetwork && !result.networkFailed {
			emptyStreak++
		}
		if emptyStreak >= wikiquoteEmptyStreakBeforeRandom {
			emptyStreak = 0
			logWarn("%s: %d consecutive discovery attempts found nothing new — falling back to random pages", site.source, wikiquoteEmptyStreakBeforeRandom)
			return c.topUpWikiquoteRandomPages(ctx, site)
		}
		return result
	}
}

func (c *Crawler) Run(ctx context.Context) error {

	quoteCount, err := c.store.CountQuotes(ctx)
	if err != nil {
		return err
	}
	totalQuoteCount.Store(quoteCount)
	log.Printf("Starting up with %d total quotes already in the database", quoteCount)

	err = c.store.WarmSimhashCache(ctx)
	if err != nil {
		return err
	}
	logInfo("Simhash cache warmed up")

	// Loads all language models from disk up front (~3.4s, confirmed live) rather than paying
	// that cost unexplained on whichever quote happens to be first through MatchesClaimedLanguage.
	dedup.WarmLanguageDetector()
	logInfo("Language detector warmed up")

	requeued, err := c.store.RequeueStuckInProgress(ctx)
	if err != nil {
		return err
	}
	if requeued > 0 {
		logWarn("Requeued %d URL(s) stuck in_progress from a previous run", requeued)
	}

	err = c.store.WarmFrontierCache(ctx)
	if err != nil {
		return err
	}

	err = c.SeedFrontier(ctx)
	if err != nil {
		return err
	}
	logInfo("Seed frontier cache warmed up")

	// Each source gets its own goroutine, each with its own cooldown, so a stall or slow fetch
	// on one never delays a fetch that's already ready on another (see runWorker). The three
	// goroutines only ever share c.store (pgxpool.Pool and redis.Client are both safe for
	// concurrent use by design) — nothing else needs synchronizing between them.
	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		c.runWorker(ctx, scoring.SourceGoodreads, minSourceDelayFor(scoring.SourceGoodreads), c.goodreadsTopUpFunc(), nil)
	}()

	// Both Wikiquote editions start at wikiquoteExperimentalDelay rather than their
	// proven-safe minSourceDelayFor value — a deliberate, bounded pacing experiment (requested
	// explicitly, with the tradeoff understood), automatically abandoned in favor of the safe
	// pace the instant either one hits a real 429 (see runWorker/abandonExperimentalPace).
	wg.Add(1)
	go func() {
		defer wg.Done()
		var deadStreak int
		c.runWorker(ctx, scoring.SourceWikiquoteEN, wikiquoteExperimentalDelay,
			c.wikiquoteTopUpFunc(wikiquoteEN),
			func(gotQuotes bool) { deadStreak = c.recordWikiquoteYield(ctx, wikiquoteEN, deadStreak, gotQuotes) },
		)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		var deadStreak int
		c.runWorker(ctx, scoring.SourceWikiquoteDE, wikiquoteExperimentalDelay,
			c.wikiquoteTopUpFunc(wikiquoteDE),
			func(gotQuotes bool) { deadStreak = c.recordWikiquoteYield(ctx, wikiquoteDE, deadStreak, gotQuotes) },
		)
	}()

	// The twelve newer editions start at the same aggressive wikiquoteExperimentalDelay as
	// EN/DE above, not their proven-safe minSourceDelayFor — see that constant's doc comment.
	for _, site := range []wikiquoteSite{
		wikiquoteFR, wikiquoteES, wikiquoteIT, wikiquotePT, wikiquotePL,
		wikiquoteSV, wikiquoteRO, wikiquoteCS, wikiquoteHU, wikiquoteDA, wikiquoteNO, wikiquoteFI,
	} {
		site := site
		wg.Add(1)
		go func() {
			defer wg.Done()
			var deadStreak int
			c.runWorker(ctx, site.source, wikiquoteExperimentalDelay,
				c.wikiquoteTopUpFunc(site),
				func(gotQuotes bool) { deadStreak = c.recordWikiquoteYield(ctx, site, deadStreak, gotQuotes) },
			)
		}()
	}

	wg.Wait() // returns once ctx is cancelled and every worker has noticed and exited
	logInfo("All workers stopped, shutting down")
	return nil
}

func (c *Crawler) SeedFrontier(ctx context.Context) error {
	// HasAnyURLs, not "any pending" — the frontier having been seeded once should stay true
	// forever, including after every seed URL finishes. Checking pending-only re-triggers
	// seeding (and re-crawls already-completed pages) the moment a batch finishes, which was
	// observed live: Wikiquote seed pages got re-fetched a 2nd/3rd time across restarts once
	// their pending count hit zero.
	seeded, err := c.store.HasAnyURLs(ctx)
	if err != nil {
		return err
	}
	if seeded {
		logInfo("Frontier already seeded.")
		return nil
	}

	goodreadsPriority := scoring.CalculatePriority(scoring.SourceGoodreads, 0, 0)
	seeds := []models.URLFrontier{
		{URL: "https://www.goodreads.com/quotes/tag/inspirational", Source: scoring.SourceGoodreads, Priority: goodreadsPriority},
	}

	// WikiquoteParser has no NextURLs discovery of its own — real discovery comes from
	// topUpWikiquoteSiteIfEmpty (MediaWiki categorymembers, see wikiquote_discovery.go) once
	// this stopgap list runs out. Each URL here is one author page yielding many quotes from a
	// single fetch, so this list lasts a while even before that kicks in. German has no
	// equivalent stopgap list — category-based discovery already works well enough that a
	// hand-picked German author list would just be redundant upfront research; it bootstraps
	// straight from topUpWikiquoteSiteIfEmpty the first time the crawler goes idle.
	wikiquotePriority := scoring.CalculatePriority(scoring.SourceWikiquoteEN, 0, 0)
	wikiquoteAuthors := []string{
		"Mark_Twain", "Oscar_Wilde", "Maya_Angelou", "Winston_Churchill", "Mahatma_Gandhi",
		"Abraham_Lincoln", "Martin_Luther_King_Jr.", "Nelson_Mandela", "William_Shakespeare",
		"Confucius", "Aristotle", "Plato", "Friedrich_Nietzsche", "Ralph_Waldo_Emerson",
		"Henry_David_Thoreau", "Eleanor_Roosevelt", "Theodore_Roosevelt", "Buddha",
		"Leonardo_da_Vinci", "Charles_Darwin",
	}
	for _, author := range wikiquoteAuthors {
		seeds = append(seeds, models.URLFrontier{
			URL:      "https://en.wikiquote.org/wiki/" + author,
			Source:   scoring.SourceWikiquoteEN,
			Priority: wikiquotePriority,
		})
	}

	for _, seed := range seeds {
		_, err := c.store.SaveURL(ctx, seed)
		if err != nil {
			log.Printf("Failed to save URL: %v", err)
			continue
		}
		err = c.store.PushURL(ctx, seed.Source, seed.URL, seed.Priority)
		if err != nil {
			log.Printf("Failed to push URL to Redis: %v", err)
		}
	}

	return nil
}

func truncate(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "..."
}
