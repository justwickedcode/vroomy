#!/usr/bin/env bash
# Dumps the quotes Postgres database to a timestamped, gzip-compressed file and deletes local
# backups older than RETENTION_DAYS. Intended to run on a schedule (cron/systemd timer — see
# the example in README's "Production deployment" section), not manually every time.
#
# This writes to local disk only. For real disaster recovery (surviving the host itself being
# lost, not just the container/volume), BACKUP_DIR should be a path that's itself synced
# offsite — a mounted network drive, or a line added below to push each dump to object storage
# (S3, Backblaze, etc.) once you've picked one; deliberately not built in here since the right
# destination depends on where this is actually deployed, not something to guess at.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

: "${POSTGRES_USER:?POSTGRES_USER must be set}"
: "${POSTGRES_DB:?POSTGRES_DB must be set}"
# No default here deliberately: the dev compose (backend/scraper/docker-compose.yml) names its
# Postgres container "quotes-crawler", while the production compose (docker-compose.prod.yml,
# repo root) names it "quotes-postgres" — guessing wrong silently backs up nothing.
: "${POSTGRES_CONTAINER:?POSTGRES_CONTAINER must be set (quotes-crawler for dev, quotes-postgres for prod)}"

mkdir -p "$BACKUP_DIR"
OUT_FILE="$BACKUP_DIR/quotes_${TIMESTAMP}.sql.gz"

echo "Backing up $POSTGRES_DB from container $POSTGRES_CONTAINER to $OUT_FILE ..."
docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT_FILE"
echo "Backup complete: $(du -h "$OUT_FILE" | cut -f1)"

echo "Removing backups older than ${RETENTION_DAYS} days ..."
find "$BACKUP_DIR" -name 'quotes_*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete
