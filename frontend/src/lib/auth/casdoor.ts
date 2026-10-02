// Talks to Casdoor's OIDC endpoints directly (standard authorization-code flow) — endpoint
// paths verified against Casdoor's own router.go source, not assumed from generic OIDC
// convention: POST /api/login/oauth/access_token for the token exchange, GET /login/oauth/
// authorize (served by Casdoor's own SPA, not its Go API) to start login, /.well-known/jwks for
// signature verification.
import { createRemoteJWKSet, jwtVerify } from 'jose'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function issuer(): string {
  return requireEnv('CASDOOR_ISSUER').replace(/\/$/, '')
}

// Must exactly match one of the Redirect URIs registered on the "vroomy" Application in
// Casdoor's admin panel — Casdoor rejects the exchange otherwise.
function redirectUri(): string {
  return `${requireEnv('PUBLIC_URL').replace(/\/$/, '')}/auth/callback`
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL('/login/oauth/authorize', issuer())
  url.searchParams.set('client_id', requireEnv('CASDOOR_CLIENT_ID'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri())
  url.searchParams.set('scope', 'openid profile email')
  url.searchParams.set('state', state)
  return url.toString()
}

interface CasdoorTokenResponse {
  id_token?: string
  access_token?: string
  error?: string
  error_description?: string
}

export async function exchangeCodeForIdToken(code: string): Promise<string> {
  const res = await fetch(new URL('/api/login/oauth/access_token', issuer()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: requireEnv('CASDOOR_CLIENT_ID'),
      client_secret: requireEnv('CASDOOR_CLIENT_SECRET'),
      code,
      redirect_uri: redirectUri(),
    }),
  })
  // Don't assume the response is JSON — a WAF/bot-check sitting in front of the issuer (e.g.
  // Cloudflare) can intercept this server-to-server call and return an HTML challenge page
  // instead of Casdoor's real response. This call can never pass a JS challenge (no browser,
  // nothing to execute it), so that's a real, permanent failure mode to surface clearly rather
  // than let a confusing "Unexpected token '<'" JSON-parse error be the only signal.
  const rayId = res.headers.get('cf-ray')
  const raw = await res.text()
  let body: CasdoorTokenResponse
  try {
    body = JSON.parse(raw)
  } catch {
    throw new Error(
      `Casdoor token exchange returned non-JSON (status ${res.status}` +
        (rayId ? `, cf-ray ${rayId}` : '') +
        `) — likely a WAF/bot-check in front of the issuer intercepting this server-to-server call: ${raw.slice(0, 300)}`,
    )
  }
  if (!res.ok || !body.id_token) {
    throw new Error(
      `Casdoor token exchange failed: ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim(),
    )
  }
  return body.id_token
}

// Casdoor's id_token claim names, as actually observed from a live token during integration
// testing — not assumed from generic OIDC convention, since Casdoor's own naming (e.g.
// "displayName"/"avatar" instead of the more common "name"/"picture") doesn't match the OIDC
// spec's usual suggestions.
export interface CasdoorClaims {
  sub: string
  name?: string
  email?: string
  avatar?: string
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

function getJwks() {
  jwks ??= createRemoteJWKSet(new URL('/.well-known/jwks', issuer()))
  return jwks
}

export async function verifyIdToken(idToken: string): Promise<CasdoorClaims> {
  const { payload } = await jwtVerify(idToken, getJwks(), { issuer: issuer() })
  return payload as unknown as CasdoorClaims
}
