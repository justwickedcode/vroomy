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
  exchangeCodeForTokens,
  fetchUserInfo,
  verifyIdToken,
} from '#/lib/auth/oidc'
import {
  destroySession,
  getCurrentSession,
  setSessionUser,
} from '#/lib/auth/session'

// One cookie per login attempt (vroomy_oauth_state_<state>) rather than a single shared one, so
// starting a second login — another tab, a reload of /login — doesn't overwrite the first
// attempt's state and strand whichever Keycloak page is still open.
const STATE_COOKIE_PREFIX = 'vroomy_oauth_state_'
// Long enough for someone to wander off from the Keycloak page and come back; the code Keycloak
// hands back is single-use and short-lived on its own, so this isn't the replay protection.
const STATE_MAX_AGE = 15 * 60
// Set when a failed state check silently restarts the login, so a browser that never keeps the
// state cookie gets the error instead of bouncing between /login and Keycloak forever.
const RETRY_COOKIE = 'vroomy_oauth_retry'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  maxAge,
  path: '/',
})

// startLogin generates a fresh CSRF state value, stashes it in a short-lived plain cookie (not
// part of the sealed session — this only needs to survive the identity provider round trip),
// and sends the browser to its hosted login page. Verified on the way back in completeLogin
// below.
export const startLogin = createServerFn({ method: 'GET' }).handler(
  async () => {
    const state = crypto.randomUUID()
    setCookie(STATE_COOKIE_PREFIX + state, '1', cookieOptions(STATE_MAX_AGE))
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
    const providerError = url.searchParams.get('error')
    if (providerError) {
      const description = url.searchParams.get('error_description')
      throw new Error(
        `Login failed: ${description ? `${providerError} (${description})` : providerError}`,
      )
    }

    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    // UUID check first — state ends up in a cookie name, so never trust it as-is.
    const stateCookie =
      state && UUID_RE.test(state) ? STATE_COOKIE_PREFIX + state : undefined
    const stateValid = !!stateCookie && getCookie(stateCookie) === '1'
    if (stateCookie) deleteCookie(stateCookie, { path: '/' })

    if (!code || !stateValid) {
      // An expired or replayed (reload / "Try again") attempt. Starting over puts the user back
      // on the Keycloak sign-in page — far better than a crash screen. Only once, though.
      if (getCookie(RETRY_COOKIE)) {
        deleteCookie(RETRY_COOKIE, { path: '/' })
        throw new Error(
          'Login failed: missing or mismatched state (possibly an expired or replayed login attempt)',
        )
      }
      setCookie(RETRY_COOKIE, '1', cookieOptions(60))
      throw redirect({ to: '/login' })
    }
    deleteCookie(RETRY_COOKIE, { path: '/' })

    const { idToken, accessToken } = await exchangeCodeForTokens(code)
    const claims = await verifyIdToken(idToken)
    // The id_token's own claims are the verified, trustworthy source for *identity* (sub is
    // always there) — but not every provider embeds profile fields (name/email/picture) in the
    // id_token itself by default (Zitadel doesn't unless "User info inside ID Token" is
    // explicitly enabled, a setting easy to miss). The userinfo endpoint fills those in
    // regardless of that setting; id_token's own values win only if userinfo didn't have them.
    const profile = await fetchUserInfo(accessToken)
    const name = profile.name ?? claims.name
    const email = profile.email ?? claims.email
    const picture = profile.picture ?? claims.picture

    // Warm api's own users row immediately (same internal-proxy pattern as
    // frontend/src/lib/typing/sentences.ts's fetchRandomQuote) so the very first page load
    // after login already has real data to show, not an empty profile briefly.
    const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:8080'
    const res = await fetch(new URL('/api/users/me', apiUrl), {
      headers: {
        'X-Vroomy-User-Id': claims.sub,
        'X-Vroomy-User-Name': name ?? '',
        'X-Vroomy-User-Email': email ?? '',
        'X-Vroomy-User-Avatar': picture ?? '',
      },
    })
    if (!res.ok) {
      throw new Error(`api rejected the new user: ${res.status}`)
    }

    await setSessionUser({
      userId: claims.sub,
      name,
      email,
      avatarUrl: picture,
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
  email?: string
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
      email: session.data.email,
      avatarUrl: session.data.avatarUrl,
    }
  },
)
