-- +goose Up
-- id is Casdoor's own "sub" claim — a stable, globally unique string identity — not a
-- locally-generated serial. api never issues its own user ids; Casdoor already owns identity.
CREATE TABLE users (
                        id               TEXT PRIMARY KEY,
                        display_name     TEXT NOT NULL,
                        email            TEXT,
                        avatar_url       TEXT,
                        car_model        VARCHAR(32) NOT NULL DEFAULT 'sport',
                        underglow        BOOLEAN NOT NULL DEFAULT false,
                        underglow_color  VARCHAR(16) NOT NULL DEFAULT '#0284c7',
                        trail            VARCHAR(32) NOT NULL DEFAULT 'nitro',
                        equipped_powerup VARCHAR(32) NOT NULL DEFAULT 'boost',
                        created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE users;
