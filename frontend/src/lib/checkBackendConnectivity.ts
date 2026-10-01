import { createServerFn } from '@tanstack/react-start'

// Logs, once at startup, whether this deployed frontend can actually reach backend/api and
// backend/ws — a misconfigured env var or a missing CORS_ALLOWED_ORIGIN otherwise only surfaces
// once a race fails mid-game with "Lost connection to the race server," far from whatever
// actually caused it. Both services expose the same GET /health contract (see
// backend/api/server.go, backend/ws/main.go), so a plain HTTP check is enough — there's no need
// to open a real WebSocket just to prove the host is reachable.

// api has no public domain in production (see docker-compose.prod.yml) — only this frontend's
// own server can reach it, over the compose network, so the check has to run server-side via a
// server function (same reasoning as fetchRandomQuote in sentences.ts) rather than a direct
// browser fetch like ws's below. ws still has a public domain for now (see PRODUCTION.md) — it
// isn't proxied yet, so its check stays a plain client-side fetch until that changes.
interface HealthResult {
  ok: boolean
  status: number | null
  ms: number
  url: string
  error?: string
}

const checkApiHealth = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HealthResult> => {
    const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:8080'
    const start = performance.now()
    try {
      const res = await fetch(new URL('/health', apiUrl))
      return {
        ok: res.ok,
        status: res.status,
        ms: Math.round(performance.now() - start),
        url: apiUrl,
      }
    } catch (err) {
      return {
        ok: false,
        status: null,
        ms: Math.round(performance.now() - start),
        url: apiUrl,
        error: String(err),
      }
    }
  },
)

async function checkApi(): Promise<void> {
  const result = await checkApiHealth()
  if (result.ok) {
    console.log(
      `[connectivity] api reachable via the frontend's own proxy, internal URL ${result.url} (${result.ms}ms)`,
    )
  } else if (result.status !== null) {
    console.warn(
      `[connectivity] api (proxied) at ${result.url} responded ${result.status} (${result.ms}ms) — check that the api service is healthy`,
    )
  } else {
    console.error(
      `[connectivity] api (proxied) unreachable at ${result.url} after ${result.ms}ms — check API_INTERNAL_URL is set correctly on the frontend and that api is on the same compose network:`,
      result.error,
    )
  }
}

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8081'

// /health is a plain HTTP route on backend/ws, not a WebSocket one — swap the scheme so it's
// fetchable the same way as api's.
function wsUrlToHttp(wsUrl: string): string {
  return wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
}

async function checkWs(): Promise<void> {
  const httpUrl = wsUrlToHttp(WS_URL)
  const start = performance.now()
  try {
    const res = await fetch(new URL('/health', httpUrl))
    const ms = Math.round(performance.now() - start)
    if (res.ok) {
      console.log(`[connectivity] ws reachable at ${httpUrl} (${ms}ms)`)
    } else {
      console.warn(
        `[connectivity] ws at ${httpUrl} responded ${res.status} (${ms}ms) — check CORS_ALLOWED_ORIGIN and that the service is healthy`,
      )
    }
  } catch (err) {
    const ms = Math.round(performance.now() - start)
    console.error(
      `[connectivity] ws unreachable at ${httpUrl} after ${ms}ms — check VITE_WS_URL, the domain/DNS setup, and CORS_ALLOWED_ORIGIN:`,
      err,
    )
  }
}

export function checkBackendConnectivity(): void {
  void checkApi()
  void checkWs()
}
