# Multi-stage build: install and build with Bun, ship Nitro's self-contained server output
# (.output/) in a minimal runtime image. Nitro detects the "bun" preset from the build-stage
# runtime and bakes in Bun.serve, so the runtime stage must also be Bun, not plain Node — running
# this build's .output/server/index.mjs under node throws "ReferenceError: Bun is not defined".
FROM oven/bun:1-alpine AS build
WORKDIR /src

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Vite inlines import.meta.env.VITE_* into the client and server bundles at build time, not at
# runtime — a real Docker build-arg would work, but plenty of PaaS UIs (Dokploy included, for a
# plain Dockerfile-type App) only ever expose *runtime* environment variables and never wire
# them through to `docker build --build-arg`, silently leaving the dev fallback baked in with no
# error anywhere. Baking in a fixed placeholder token instead, and swapping it for the real
# value at container startup (see docker-entrypoint.sh), sidesteps that entirely: VITE_WS_URL
# only ever needs to be an ordinary runtime env var, however the host exposes those. (The old
# VITE_API_URL equivalent is gone — backend/api has no public domain at all anymore, see
# docker-compose.prod.yml, so the client bundle never needs to know its address; see
# src/lib/typing/sentences.ts's createServerFn-based proxy, configured via the plain runtime env
# var API_INTERNAL_URL, which needs no build-time handling since it's only ever read inside a
# server-only handler.)
ENV VITE_WS_URL=__VROOMY_RUNTIME_WS_URL__
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=build /src/.output ./
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0
ENTRYPOINT ["/app/docker-entrypoint.sh"]
