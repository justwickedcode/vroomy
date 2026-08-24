-- +goose Up
CREATE TABLE quotes (
                        id          BIGSERIAL PRIMARY KEY,
                        text        TEXT NOT NULL,
                        author      VARCHAR(255),
                        tags        JSONB,
                        source      VARCHAR(255),
                        sha256_hash VARCHAR(64) NOT NULL UNIQUE,
                        simhash     BIGINT,
                        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotes_author ON quotes(author);
CREATE INDEX idx_quotes_source ON quotes(source);
CREATE INDEX idx_quotes_simhash ON quotes(simhash);

-- +goose Down
DROP TABLE quotes;
