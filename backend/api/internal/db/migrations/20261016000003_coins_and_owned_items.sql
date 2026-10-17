-- +goose Up
-- The garage shop: a coin balance earned by racing (see shop.go's coinsForRace) and the paid
-- items a player has bought ("car:lambo", "trail:smoke", "powerup:nuke", "underglow"...). Free
-- items are never stored here; ownership of those is implied.
ALTER TABLE users
    ADD COLUMN coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
    ADD COLUMN owned TEXT[] NOT NULL DEFAULT '{}';

-- Everything was unlocked before the shop existed, so nobody loses what they're using: whatever
-- each player has equipped right now becomes theirs.
UPDATE users SET owned = array_remove(ARRAY[
    'car:' || car_model,
    'trail:' || trail,
    'powerup:' || equipped_powerup,
    CASE WHEN underglow THEN 'underglow' END
], NULL);

-- Back pay: the coins every race already on record would have earned (same formula as
-- shop.go's coinsForRace — base, speed, placement and daily bonus).
UPDATE users u SET coins = earned.total
FROM (
    SELECT user_id, SUM(
        10 + ROUND(wpm / 4.0)
        + CASE WHEN racer_count > 1 AND placement = 1 THEN 20
               WHEN racer_count > 1 AND placement = 2 THEN 10
               WHEN racer_count > 1 AND placement = 3 THEN 5
               ELSE 0 END
        + CASE WHEN mode = 'daily' THEN 15 ELSE 0 END
    )::int AS total
    FROM race_results
    GROUP BY user_id
) earned
WHERE earned.user_id = u.id;

-- +goose Down
ALTER TABLE users DROP COLUMN owned, DROP COLUMN coins;
