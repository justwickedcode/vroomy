-- +goose Up
-- One row per calendar day: the passage everyone types for that day's challenge. Picked lazily
-- from the live quotes corpus by the first request for that day and then frozen here, so the
-- daily passage stays identical for every player all day even while the crawler keeps adding
-- rows (re-deriving it from the corpus on every request would shift as the corpus grows).
-- A copy of the text rather than a FK into quotes: quotes is owned by quotes-crawler, and api
-- deliberately holds no DB-level dependency on that schema.
CREATE TABLE daily_quotes (
                              day        DATE PRIMARY KEY,
                              text       TEXT NOT NULL,
                              author     TEXT NOT NULL,
                              source     TEXT NOT NULL,
                              language   TEXT NOT NULL,
                              created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE daily_quotes;
