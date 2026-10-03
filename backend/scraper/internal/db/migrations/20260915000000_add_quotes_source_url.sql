-- +goose Up
ALTER TABLE quotes ADD COLUMN source_url TEXT;

-- +goose Down
ALTER TABLE quotes DROP COLUMN source_url;
