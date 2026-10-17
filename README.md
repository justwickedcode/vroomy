# Vroomy

A multiplayer typing-race game. Quotes come from [`quotes-crawler`](../quotes-crawler) via a shared Postgres.

## Run locally

Needs Bun, Go and a Postgres with the crawler's `quotes` table.

```bash
cd backend/api && cp .env.example .env && go run .   # :8080
cd backend/ws  && cp .env.example .env && go run .   # :8081
cd frontend    && bun install && bun --bun run dev   # :3000
```

Logging in needs the `OIDC_*`, `PUBLIC_URL` and `SESSION_SECRET` vars in `frontend/.env`; everything else works as a guest.

Tests: `go test ./...` in `backend/api` and `backend/ws`.

## Deploy

`docker compose up -d` with the variables listed at the top of `docker-compose.yml`.

## Layout

- `frontend/` — TanStack Start app
- `backend/api/` — Go REST API ([README](backend/api/README.md))
- `backend/ws/` — Go WebSocket race server ([README](backend/ws/README.md))
