-- +goose Up
ALTER TABLE quotes ADD COLUMN word_count INT NOT NULL DEFAULT 0;
UPDATE quotes SET word_count = array_length(regexp_split_to_array(trim(text), '\s+'), 1);
CREATE INDEX idx_quotes_language_word_count ON quotes(language, word_count);

-- +goose Down
DROP INDEX idx_quotes_language_word_count;
ALTER TABLE quotes DROP COLUMN word_count;
