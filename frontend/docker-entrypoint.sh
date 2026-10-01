#!/bin/sh
set -eu

# The build baked __VROOMY_RUNTIME_API_URL__/__VROOMY_RUNTIME_WS_URL__ into every built file in
# place of the real VITE_API_URL/VITE_WS_URL (see Dockerfile) — swap them for whatever this
# container was actually started with, right before the server starts. Same dev-friendly
# defaults as the source's own `import.meta.env.VITE_API_URL ?? 'http://localhost:8080'`
# fallback, for a container started with neither set.
API_URL="${VITE_API_URL:-http://localhost:8080}"
WS_URL="${VITE_WS_URL:-ws://localhost:8081}"

find /app -type f \( -name '*.mjs' -o -name '*.js' \) -print0 |
  xargs -0 sed -i "s|__VROOMY_RUNTIME_API_URL__|${API_URL}|g; s|__VROOMY_RUNTIME_WS_URL__|${WS_URL}|g"

exec bun server/index.mjs
