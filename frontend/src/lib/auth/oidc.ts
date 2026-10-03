// Talks to the identity provider's OIDC endpoints — the token/JWKS/issuer URLs are read from
// its own /.well-known/openid-configuration discovery document (standard OIDC pattern) rather
// than hardcoded. Provider-agnostic on purpose: this used to be Casdoor-specific code, but
// discovery-driven endpoints plus standard OIDC claim names mean switching identity providers
// (Casdoor → Zitadel, or anything else later) needs no changes here beyond env vars.
import { createRemoteJWKSet, jwtVerify } from 'jose'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function issuerBase(): string {
  return requireEnv('OIDC_ISSUER').replace(/\/$/, '')
}

// Must exactly match one of the Redirect URIs registered on the OIDC application in the
// identity provider's admin console — it rejects the exchange otherwise.
function redirectUri(): string {
  return `${requireEnv('PUBLIC_URL').replace(/\/$/, '')}/auth/callback`
}

interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  userinfo_endpoint: string
}

// Fetched once per server process and cached — the provider's own config isn't expected to
// change without a redeploy, and every login hitting this on every request would be wasted
// latency.
let discoveryPromise: Promise<OidcDiscovery> | undefined

function getDiscovery(): Promise<OidcDiscovery> {
  // Deliberately NOT `new URL('/.well-known/...', issuerBase())` — a leading slash in the
  // relative argument makes URL resolution replace the ENTIRE path from root, silently
  // dropping any path the issuer itself already has. Invisible with Casdoor/Zitadel (bare-
  // domain issuers, no path to lose) but a real bug hit live with Keycloak, whose issuer
  // includes a realm path (.../realms/vroomy) that got dropped entirely, producing a 404 at
  // the server's root instead of the real discovery endpoint. Plain string concatenation
  // appends instead of replacing, which is what's actually wanted here regardless of whether
  // the issuer has a path component or not.
  discoveryPromise ??= fetch(
    `${issuerBase()}/.well-known/openid-configuration`,
  ).then(async (res) => {
    if (!res.ok) {
      throw new Error(
        `OIDC discovery failed: ${res.status} ${await res.text()}`,
      )
    }
    return res.json() as Promise<OidcDiscovery>
  })
  return discoveryPromise
}

export async function buildAuthorizeUrl(state: string): Promise<string> {
  const discovery = await getDiscovery()
  const url = new URL(discovery.authorization_endpoint)
  url.searchParams.set('client_id', requireEnv('OIDC_CLIENT_ID'))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri())
  // Optional, Zitadel-specific: a bare client_id does NOT automatically scope the login flow to
  // that application's own organization — without this, Zitadel falls back to the instance's
  // default organization's Login Policy (branding, allowed auth methods, enabled IDPs), not the
  // org the application actually belongs to. Confirmed live: GitHub/Google and "password
  // disabled" were configured on a dedicated org, but kept showing the default org's plain
  // password form instead, until this scope was added. Harmless to include for other providers
  // that don't recognize this scope — an unrecognized scope value is just ignored per spec.
  const orgId = process.env.OIDC_ORG_ID
  const scopes = ['openid', 'profile', 'email']
  if (orgId) scopes.push(`urn:zitadel:iam:org:id:${orgId}`)
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', state)
  // Logging out of Vroomy only ends Vroomy's own session (see performLogout in actions.ts) —
  // it deliberately doesn't touch the identity provider's SSO session, since that session may
  // be shared with other apps later (the whole point of a shared identity provider). Without
  // this, clicking "Log in" again after logging out silently reuses the still-alive provider
  // session instead of a real login. `select_account` alone isn't enough — confirmed live, it
  // let a single click "confirm" the existing session without re-entering a password. `login`
  // is the OIDC prompt value that actually forces fresh re-authentication regardless of an
  // existing session; the two combine (space-separated, per spec) to get both a real login and
  // a chooser shown every time.
  url.searchParams.set('prompt', 'select_account login')
  return url.toString()
}

interface OidcTokenResponse {
  id_token?: string
  access_token?: string
  error?: string
  error_description?: string
}

export interface TokenResult {
  idToken: string
  accessToken?: string
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenResult> {
  const discovery = await getDiscovery()
  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: requireEnv('OIDC_CLIENT_ID'),
      client_secret: requireEnv('OIDC_CLIENT_SECRET'),
      code,
      redirect_uri: redirectUri(),
    }),
  })
  // Don't assume the response is JSON — a WAF/bot-check sitting in front of the issuer (e.g.
  // Cloudflare) can intercept this server-to-server call and return an HTML challenge page
  // instead of the provider's real response. This call can never pass a JS challenge (no
  // browser, nothing to execute it), so that's a real, permanent failure mode worth surfacing
  // clearly rather than letting a confusing "Unexpected token '<'" JSON-parse error be the only
  // signal — a real failure mode hit live during integration testing.
  const rayId = res.headers.get('cf-ray')
  const raw = await res.text()
  let body: OidcTokenResponse
  try {
    body = JSON.parse(raw)
  } catch {
    throw new Error(
      `OIDC token exchange returned non-JSON (status ${res.status}` +
        (rayId ? `, cf-ray ${rayId}` : '') +
        `) — likely a WAF/bot-check in front of the issuer intercepting this server-to-server call: ${raw.slice(0, 300)}`,
    )
  }
  if (!res.ok || !body.id_token) {
    throw new Error(
      `OIDC token exchange failed: ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim(),
    )
  }
  return { idToken: body.id_token, accessToken: body.access_token }
}

// Not every provider embeds profile claims (name/email/picture) directly in the id_token by
// default — Zitadel, for one, only does this if "User info inside ID Token" is explicitly
// enabled on the application, a setting easy to forget. Calling the standard OIDC userinfo
// endpoint with the access_token works regardless of that setting, so profile data doesn't
// depend on remembering to flip one specific admin toggle correctly. Returns an empty object
// (never throws) on failure — this enriches the identity, it doesn't gate login on it; the
// verified id_token's `sub` is already enough to know who the user is.
export async function fetchUserInfo(
  accessToken: string | undefined,
): Promise<Partial<OidcClaims>> {
  if (!accessToken) return {}
  try {
    const discovery = await getDiscovery()
    const res = await fetch(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return {}
    return (await res.json()) as Partial<OidcClaims>
  } catch {
    return {}
  }
}

// Standard OIDC claim names (sub/name/email/picture) — unlike Casdoor, which embedded its own
// User struct directly into the token with non-standard names ("displayName" instead of
// "name"), Zitadel's id_token (confirmed against its real discovery document's
// claims_supported) uses the conventional OIDC set. Note Zitadel doesn't include "picture" in
// its supported claims at all, so avatarUrl will always be empty for Zitadel-issued tokens —
// already handled gracefully by the UI's initial-letter fallback.
export interface OidcClaims {
  sub: string
  name?: string
  email?: string
  picture?: string
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

async function getJwks() {
  if (!jwks) {
    const discovery = await getDiscovery()
    jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
  }
  return jwks
}

export async function verifyIdToken(idToken: string): Promise<OidcClaims> {
  const discovery = await getDiscovery()
  const { payload } = await jwtVerify(idToken, await getJwks(), {
    issuer: discovery.issuer,
  })
  return payload as unknown as OidcClaims
}
