#!/bin/sh
set -eu

# The build baked __VROOMY_RUNTIME_WS_URL__ into every built file in place of the real
# VITE_WS_URL (see Dockerfile) — swap it for whatever this container was actually started with,
# right before the server starts. Same dev-friendly default as the source's own
# `import.meta.env.VITE_WS_URL ?? 'ws://localhost:8081'` fallback, for a container started with
# it unset. (api has no equivalent anymore — see Dockerfile's comment on API_INTERNAL_URL.)
WS_URL="${VITE_WS_URL:-ws://localhost:8081}"

find /app -type f \( -name '*.mjs' -o -name '*.js' \) -print0 |
  xargs -0 sed -i "s|__VROOMY_RUNTIME_WS_URL__|${WS_URL}|g"

exec bun server/index.mjs
