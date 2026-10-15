-- +goose Up
-- The page the daily passage was scraped from, so the challenge can credit and link to it.
-- Nullable: older quotes in the corpus don't have one.
ALTER TABLE daily_quotes ADD COLUMN source_url TEXT;

-- +goose Down
ALTER TABLE daily_quotes DROP COLUMN source_url;
