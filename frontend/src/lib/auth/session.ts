// Vroomy's own login-state cookie — deliberately separate from the identity provider's id_token.
// The OIDC exchange (see oidc.ts) only ever runs once, in /auth/callback; after that, this
// encrypted, sealed cookie (TanStack Start's own getSession/updateSession/clearSession, built on
// h3's iron-session-style sealing) is the only thing any other route or server function needs to
// check — no re-verifying a JWT or re-reaching the identity provider on every request.
import {
  clearSession,
  getSession,
  updateSession,
} from '@tanstack/react-start/server'

export interface VroomySessionData {
  userId?: string
  name?: string
  email?: string
  avatarUrl?: string
}

function sessionConfig() {
  const password = process.env.SESSION_SECRET
  if (!password) {
    throw new Error(
      'SESSION_SECRET is not set — required to seal the session cookie',
    )
  }
  return {
    password,
    name: 'vroomy_session',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  }
}

// How stale a logged-in session's createdAt may get before getCurrentSession re-seals it with a
// fresh one — once a day keeps the cookie churn negligible while making maxAge effectively mean
// "30 days of inactivity" rather than a hard cap.
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000

// h3 expires a session at createdAt + maxAge, and createdAt is stamped the first time getSession
// runs for a visitor — which is their first *guest* page view (getCurrentUser runs everywhere),
// not their login. Left alone, someone who browsed as a guest for 29 days and then logged in
// got logged out a day later, and nobody ever got more than 30 days total. getSession returns
// the very object h3 keeps in the request context and seals on updateSession, so resetting
// createdAt here (then re-sealing) moves the expiry for real.
export async function getCurrentSession() {
  const config = sessionConfig()
  const session = await getSession<VroomySessionData>(config)
  if (session.data.userId && Date.now() - session.createdAt > RENEW_AFTER_MS) {
    session.createdAt = Date.now()
    await updateSession<VroomySessionData>(config)
  }
  return session
}

// Login always starts a brand-new session (new id, fresh createdAt, no leftover guest data)
// rather than writing into whatever guest session the browser already had — that both fixes
// the inherited-expiry problem above and avoids session fixation.
export async function setSessionUser(user: VroomySessionData) {
  const config = sessionConfig()
  const session = await getSession<VroomySessionData>(config)
  session.id = crypto.randomUUID()
  session.createdAt = Date.now()
  for (const key of Object.keys(session.data)) {
    delete session.data[key as keyof VroomySessionData]
  }
  return updateSession<VroomySessionData>(config, user)
}

export async function destroySession() {
  return clearSession(sessionConfig())
}
