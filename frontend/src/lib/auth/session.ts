// Vroomy's own login-state cookie — deliberately separate from Casdoor's id_token. The OIDC
// exchange (see casdoor.ts) only ever runs once, in /auth/callback; after that, this encrypted,
// sealed cookie (TanStack Start's own getSession/updateSession/clearSession, built on h3's
// iron-session-style sealing) is the only thing any other route or server function needs to
// check — no re-verifying a JWT or re-reaching Casdoor on every request.
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

export async function getCurrentSession() {
  return getSession<VroomySessionData>(sessionConfig())
}

export async function setSessionUser(user: VroomySessionData) {
  return updateSession<VroomySessionData>(sessionConfig(), user)
}

export async function destroySession() {
  return clearSession(sessionConfig())
}
