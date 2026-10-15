-- +goose Up

-- Replays: the passage plus a compact keystroke timeline (see replays.go's replayEvent), stored
-- with the race they belong to. Both nullable — races imported from a guest's localStorage, and
-- any race recorded before this migration, have no replay. mode tells solo, multiplayer and
-- daily-challenge runs apart in history and on the leaderboard.
ALTER TABLE race_results
    ADD COLUMN mode    VARCHAR(16) NOT NULL DEFAULT 'solo',
    ADD COLUMN passage TEXT,
    ADD COLUMN replay  JSONB;

-- Leaderboard windows ("best race per user in the last 24h / 7 days") scan by created_at first.
CREATE INDEX idx_race_results_created_at ON race_results(created_at);

-- One row per user per day: their best daily-challenge run. Upserted with GREATEST-style logic
-- (see daily.go) so a worse retry never overwrites a better run.
CREATE TABLE daily_results (
                               user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                               day        DATE NOT NULL,
                               wpm        SMALLINT NOT NULL,
                               accuracy   SMALLINT NOT NULL,
                               race_id    BIGINT REFERENCES race_results(id) ON DELETE SET NULL,
                               updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                               PRIMARY KEY (user_id, day)
);

CREATE INDEX idx_daily_results_day_wpm ON daily_results(day, wpm DESC);

-- A friend request is one directed row; accepting it flips status rather than inserting a second
-- row. The pair index makes A→B and B→A the same relationship, so two people sending each other
-- requests at the same moment can't end up with two rows.
CREATE TABLE friendships (
                             requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                             addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                             status       VARCHAR(16) NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'accepted')),
                             created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
                             PRIMARY KEY (requester_id, addressee_id),
                             CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX idx_friendships_pair
    ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);

-- +goose Down
DROP TABLE friendships;
DROP TABLE daily_results;
DROP INDEX idx_race_results_created_at;
ALTER TABLE race_results DROP COLUMN replay, DROP COLUMN passage, DROP COLUMN mode;
