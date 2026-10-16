-- +goose Up
-- The hour of day (0-23) on the player's own clock when they finished a race — the Early bird and
-- Night owl achievements are about local time, which the server can't know otherwise. Nullable:
-- races from before this column existed never had one.
ALTER TABLE race_results ADD COLUMN local_hour SMALLINT CHECK (local_hour BETWEEN 0 AND 23);

-- Achievements a player has unlocked, each paid out exactly once (see achievements.go). The
-- primary key is what makes "once" hold even if two races finish at the same moment.
CREATE TABLE user_achievements (
                                   user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                   achievement_id TEXT NOT NULL,
                                   unlocked_at    TIMESTAMP NOT NULL DEFAULT NOW(),
                                   PRIMARY KEY (user_id, achievement_id)
);

-- +goose Down
DROP TABLE user_achievements;
ALTER TABLE race_results DROP COLUMN local_hour;
