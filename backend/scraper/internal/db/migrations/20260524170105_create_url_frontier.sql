-- +goose Up
CREATE TYPE crawl_status AS ENUM ('pending', 'in_progress', 'done', 'failed');

CREATE TABLE url_frontier (
                      id            BIGSERIAL PRIMARY KEY,
                      url           TEXT        NOT NULL UNIQUE,
                      source        TEXT        NOT NULL,         -- toscrape, brainyquote, quotable, etc.
                      priority      FLOAT       NOT NULL,         -- lower score = crawled sooner
                      depth         INT         NOT NULL DEFAULT 0,
                      status        crawl_status        NOT NULL DEFAULT 'pending', -- pending | in_progress | done | failed
                      error_count   INT         NOT NULL DEFAULT 0,
                      last_crawled_at TIMESTAMPTZ,
                      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_url_frontier_status_priority ON url_frontier(status, priority);

-- +goose Down
DROP TABLE url_frontier;
DROP TYPE crawl_status;