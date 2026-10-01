// Logs, once at startup, whether this deployed frontend can actually reach backend/api and
// backend/ws — a misconfigured VITE_API_URL/VITE_WS_URL build arg or a missing
// CORS_ALLOWED_ORIGIN otherwise only surfaces once a race fails mid-game with "Lost connection
// to the race server," far from whatever actually caused it. Both services expose the same
// GET /health contract (see backend/api/server.go, backend/ws/main.go), so a plain HTTP check
// is enough — there's no need to open a real WebSocket just to prove the host is reachable.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8081'

// /health is a plain HTTP route on backend/ws, not a WebSocket one — swap the scheme so it's
// fetchable the same way as api's.
function wsUrlToHttp(wsUrl: string): string {
  return wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
}

async function checkHealth(name: string, httpUrl: string): Promise<void> {
  const start = performance.now()
  try {
    const res = await fetch(new URL('/health', httpUrl))
    const ms = Math.round(performance.now() - start)
    if (res.ok) {
      console.log(`[connectivity] ${name} reachable at ${httpUrl} (${ms}ms)`)
    } else {
      console.warn(
        `[connectivity] ${name} at ${httpUrl} responded ${res.status} (${ms}ms) — check CORS_ALLOWED_ORIGIN and that the service is healthy`,
      )
    }
  } catch (err) {
    const ms = Math.round(performance.now() - start)
    console.error(
      `[connectivity] ${name} unreachable at ${httpUrl} after ${ms}ms — check VITE_API_URL/VITE_WS_URL, the domain/DNS setup, and CORS_ALLOWED_ORIGIN:`,
      err,
    )
  }
}

export function checkBackendConnectivity(): void {
  void checkHealth('api', API_URL)
  void checkHealth('ws', wsUrlToHttp(WS_URL))
}
