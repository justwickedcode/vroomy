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
# runtime — so these are build args here, not environment variables on the runtime stage below.
# See PRODUCTION.md for what to point them at.
ARG VITE_API_URL
ARG VITE_WS_URL
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=build /src/.output ./

EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0
ENTRYPOINT ["bun", "server/index.mjs"]
