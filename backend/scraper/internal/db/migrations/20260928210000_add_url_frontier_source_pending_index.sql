-- +goose Up
-- CountPendingBySource (internal/db/store.go) runs "WHERE source = $1 AND status = 'pending'"
-- on essentially every runWorker loop iteration, for every one of the ~15 concurrent crawler
-- workers — a hot path, not an occasional query. The existing idx_url_frontier_status_priority
-- index leads with status, not source, so this query could only use it to narrow to *all*
-- pending rows across every source, then scan every one of them checking source with no index
-- support at all — increasingly expensive as the frontier grows, which it does continuously by
-- design. A partial index (source only, WHERE status = 'pending') exactly matches this query's
-- hardcoded status literal: small, since it only ever indexes the pending subset rather than the
-- full history of done/failed rows, and it shrinks back down as rows move out of pending, unlike
-- a full (source, status) index that would carry every row forever.
CREATE INDEX idx_url_frontier_source_pending ON url_frontier(source) WHERE status = 'pending';

-- +goose Down
DROP INDEX idx_url_frontier_source_pending;
