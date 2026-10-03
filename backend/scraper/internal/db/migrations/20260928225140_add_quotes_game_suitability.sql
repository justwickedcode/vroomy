-- +goose Up
-- game_unsuitable/unsuitable_reason mark quotes that are real, correctly-sourced content but not
-- a good fit for a typing-race game specifically (too short, contains characters/markup that
-- can't reasonably be typed) — see dedup.GameSuitability (internal/dedup/dedup.go) for the
-- detection logic and the live corpus evidence behind each rule. A flag, not a deletion: the
-- corpus stays intact for any future non-typing-game consumer.
ALTER TABLE quotes ADD COLUMN game_unsuitable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE quotes ADD COLUMN unsuitable_reason TEXT;

-- Matches RandomTypingQuote's exact filter columns (language, game_unsuitable, word_count) — see
-- backend/api/quotes.go and backend/ws/quotes.go, both of which filter on all three together.
CREATE INDEX idx_quotes_language_unsuitable_word_count ON quotes(language, game_unsuitable, word_count);

-- +goose Down
DROP INDEX idx_quotes_language_unsuitable_word_count;
ALTER TABLE quotes DROP COLUMN unsuitable_reason;
ALTER TABLE quotes DROP COLUMN game_unsuitable;
