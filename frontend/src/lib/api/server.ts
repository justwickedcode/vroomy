import { getRequestHeader } from '@tanstack/react-start/server'
import { getCurrentSession } from '#/lib/auth/session'

// Server-only: call these from inside a createServerFn handler, never from component code.
//
// backend/api has no public domain (see docker-compose.yml) — only this frontend's own server
// can reach it, over the compose network. API_INTERNAL_URL is a plain runtime env var (not
// VITE_-prefixed, so it's never inlined into the client bundle), read fresh on every call.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

type AuthMode =
  // No identity forwarded (public quote endpoints).
  | 'none'
  // Forward the identity if there's a session; the endpoint works either way (leaderboards).
  | 'optional'
  // Fail with 401 before calling api if nobody's logged in.
  | 'required'

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  search?: Record<string, string | undefined>
  auth?: AuthMode
}

export async function apiFetch<T>(
  path: string,
  { method = 'GET', body, search, auth = 'none' }: ApiFetchOptions = {},
): Promise<T> {
  const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:8080'
  const url = new URL(path, apiUrl)
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value) url.searchParams.set(key, value)
  }

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  // Without this, every player's request would arrive at api from this one container's own
  // address, collapsing api's per-visitor rate limit (backend/api/ratelimit.go's clientIP) into
  // one shared bucket for the whole site.
  const forwardedFor = getRequestHeader('x-forwarded-for')
  if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor

  if (auth !== 'none') {
    // api trusts these headers because nothing but this server can reach it (see
    // backend/api/users.go's withIdentity) — they're only ever set here, from the sealed
    // session cookie, never from anything the browser sent.
    const session = await getCurrentSession()
    const user = session.data
    if (user.userId) {
      headers['X-Vroomy-User-Id'] = user.userId
      headers['X-Vroomy-User-Name'] = user.name ?? ''
      headers['X-Vroomy-User-Email'] = user.email ?? ''
      headers['X-Vroomy-User-Avatar'] = user.avatarUrl ?? ''
    } else if (auth === 'required') {
      throw new ApiError(401, 'not logged in')
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `api returned ${res.status}`
    try {
      const err = (await res.json()) as { error?: string }
      if (err.error) message = err.error
    } catch {
      // Not JSON — keep the status-only message.
    }
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as T
}
