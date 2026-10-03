-- +goose Up
ALTER TABLE quotes ADD COLUMN language VARCHAR(8) NOT NULL DEFAULT 'en';

CREATE INDEX idx_quotes_language ON quotes(language);

-- +goose Down
DROP INDEX idx_quotes_language;
ALTER TABLE quotes DROP COLUMN language;
