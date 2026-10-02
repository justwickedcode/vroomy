-- +goose Up
CREATE TABLE race_results (
                               id          BIGSERIAL PRIMARY KEY,
                               user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                               wpm         SMALLINT NOT NULL,
                               accuracy    SMALLINT NOT NULL,
                               placement   SMALLINT NOT NULL,
                               racer_count SMALLINT NOT NULL,
                               created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Every read pattern api needs: "this user's races, newest first" (profile history) and "this
-- user's aggregate stats" (best/avg wpm, avg accuracy, wins) — both scoped by user_id, the
-- latter also scanning created_at/wpm/placement, so one composite index covers both without a
-- second index to maintain.
CREATE INDEX idx_race_results_user_id_created_at ON race_results(user_id, created_at DESC);

-- +goose Down
DROP TABLE race_results;
