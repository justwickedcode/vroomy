// Package db owns api's own tables (users, race_results) — distinct from backend/scraper's
// migrations, which own quotes/url_frontier in the same physical Postgres database. goose's
// migration-version tracking defaults to one shared "goose_db_version" table regardless of
// which Go binary calls it, so without SetTableName below, api's and scraper's independent
// migration histories would land in the same tracking table and get mixed together (not
// corrupted — the version numbers wouldn't collide since the two services' migration
// timestamps differ — just confusing bookkeeping). SetTableName gives api's own migrations a
// separate "api_goose_db_version" table, keeping each service's history clean.
package db

import (
	"embed"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrations embed.FS

func Migrate(pool *pgxpool.Pool) error {
	sqlDB := stdlib.OpenDBFromPool(pool)

	goose.SetBaseFS(migrations)
	goose.SetTableName("api_goose_db_version")

	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}

	if err := goose.Up(sqlDB, "migrations"); err != nil {
		return err
	}

	return nil
}
