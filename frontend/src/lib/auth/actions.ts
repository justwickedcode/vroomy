import { createServerFn } from '@tanstack/react-start'
import {
  deleteCookie,
  getCookie,
  getRequestUrl,
  setCookie,
} from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import {
  buildAuthorizeUrl,
  exchangeCodeForIdToken,
  verifyIdToken,
} from '#/lib/auth/oidc'
import {
  destroySession,
  getCurrentSession,
  setSessionUser,
} from '#/lib/auth/session'

const STATE_COOKIE = 'vroomy_oauth_state'

// startLogin generates a fresh CSRF state value, stashes it in a short-lived plain cookie (not
// part of the sealed session — this only needs to survive the few seconds of the identity
// provider round trip), and sends the browser to its hosted login page. Verified on the way
// back in completeLogin below.
export const startLogin = createServerFn({ method: 'GET' }).handler(
  async () => {
    const state = crypto.randomUUID()
    setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 300,
      path: '/',
    })
    throw redirect({ href: await buildAuthorizeUrl(state) })
  },
)

// completeLogin handles the redirect back from the identity provider
// (/auth/callback?code=...&state=...). Reads code/state straight off the real incoming request
// URL rather than through TanStack Router's search-param plumbing — simpler, and reflects
// exactly what the provider actually sent.
export const completeLogin = createServerFn({ method: 'GET' }).handler(
  async () => {
    const url = getRequestUrl()
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const expectedState = getCookie(STATE_COOKIE)
    deleteCookie(STATE_COOKIE, { path: '/' })

    if (!code || !state || !expectedState || state !== expectedState) {
      throw new Error(
        'Login failed: missing or mismatched state (possibly an expired or replayed login attempt)',
      )
    }

    const idToken = await exchangeCodeForIdToken(code)
    const claims = await verifyIdToken(idToken)

    // Warm api's own users row immediately (same internal-proxy pattern as
    // frontend/src/lib/typing/sentences.ts's fetchRandomQuote) so the very first page load
    // after login already has real data to show, not an empty profile briefly.
    const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:8080'
    const res = await fetch(new URL('/api/users/me', apiUrl), {
      headers: {
        'X-Vroomy-User-Id': claims.sub,
        'X-Vroomy-User-Name': claims.name ?? '',
        'X-Vroomy-User-Email': claims.email ?? '',
        'X-Vroomy-User-Avatar': claims.picture ?? '',
      },
    })
    if (!res.ok) {
      throw new Error(`api rejected the new user: ${res.status}`)
    }

    await setSessionUser({
      userId: claims.sub,
      name: claims.name,
      email: claims.email,
      avatarUrl: claims.picture,
    })

    throw redirect({ to: '/' })
  },
)

export const performLogout = createServerFn({ method: 'GET' }).handler(
  async () => {
    await destroySession()
    throw redirect({ to: '/' })
  },
)

export interface CurrentUser {
  id: string
  name?: string
  avatarUrl?: string
}

// getCurrentUser is the one thing the rest of the app needs to know: who's logged in, if
// anyone. Deliberately returns null rather than throwing on a logged-out visitor — "no session"
// is the ordinary, expected case (every guest, every first-time visitor), not an error.
export const getCurrentUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CurrentUser | null> => {
    const session = await getCurrentSession()
    if (!session.data.userId) return null
    return {
      id: session.data.userId,
      name: session.data.name,
      avatarUrl: session.data.avatarUrl,
    }
  },
)
