-- +goose Up

-- A race ticket is the server's own record that a race really ran (see tickets.go): issued to a
-- logged-in player before a solo or daily race starts, or written by the ws server for each
-- player who finishes a multiplayer race (user_id NULL: whoever holds the id claims it, and the
-- id only ever goes to that player's connection). A race is only saved against a ticket, once.
CREATE TABLE race_tickets (
                              id          TEXT PRIMARY KEY,
                              user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
                              mode        VARCHAR(16) NOT NULL,
                              passage_sha TEXT NOT NULL,
                              daily_day   DATE,
                              -- Multiplayer only: the result as the ws server measured it.
                              wpm         REAL,
                              placement   SMALLINT,
                              racer_count SMALLINT,
                              issued_at   TIMESTAMP NOT NULL DEFAULT NOW(),
                              used_at     TIMESTAMP
);

CREATE INDEX idx_race_tickets_issued_at ON race_tickets(issued_at);

-- Whether a race counts for the leaderboards: true for a race saved against a ticket, false for
-- an import (a guest's history carried over on login). NULL is a race from before tickets, which
-- the api re-checks from its replay once at startup (see backfill.go).
ALTER TABLE race_results ADD COLUMN verified BOOLEAN;

-- +goose Down
ALTER TABLE race_results DROP COLUMN verified;
DROP TABLE race_tickets;
