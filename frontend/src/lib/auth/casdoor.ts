// Talks to Casdoor's OIDC endpoints — the token/JWKS/issuer URLs are read from Casdoor's own
// /.well-known/openid-configuration discovery document (standard OIDC pattern) rather than
// hardcoded, specifically because Casdoor computes its actual `iss` claim from its own server
// config (object/wellknown_oidc_discovery.go's getOriginFromHost, using app.conf's "origin" if
// set) — a value this code has no reliable way to predict in advance. Hardcoding a guessed
// issuer string caused a real "unexpected 'iss' claim value" failure during integration testing;
// reading it from discovery instead means it can never drift out of sync with the real value.
import { createRemoteJWKSet, jwtVerify } from 'jose'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function issuerBase(): string {
  return requireEnv('CASDOOR_ISSUER').replace(/\/$/, '')
}

// Must exactly match one of the Redirect URIs registered on the "vroomy" Application in
// Casdoor's admin panel — Casdoor rejects the exchange otherwise.
function redirectUri(): string {
  return `${requireEnv('PUBLIC_URL').replace(/\/$/, '')}/auth/callback`
}

interface OidcDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
}

// Fetched once per server process and cached — Casdoor's own config isn't expected to change
// without a redeploy, and every login hitting this on every request would be wasted latency.
let discoveryPromise: Promise<OidcDiscovery> | undefined

function getDiscovery(): Promise<OidcDiscovery> {
  discoveryPromise ??= fetch(
    new URL('/.well-known/openid-configuration', issuerBase()),
  ).then(async (res) => {
    if (!res.ok) {
      throw new Error(
        `Casdoor OIDC discovery failed: ${res.status} ${await res.text()}`,
      )
    }
    return res.json() as Promise<OidcDiscovery>
  })
  return discoveryPromise
}

export async function buildAuthorizeUrl(state: string): Promise<string> {
  const discovery = await getDiscovery()
  const url = new URL(discovery.authorization_endpoint)
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
  const discovery = await getDiscovery()
  const res = await fetch(discovery.token_endpoint, {
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

// Casdoor's id_token embeds its internal User struct directly (object/token_jwt.go's Claims
// embeds *User), which uses "displayName" for the human-readable name and "name" for Casdoor's
// own internal username — not interchangeable, and not the generic OIDC "name"/"picture" this
// code assumed at first. Verified against Casdoor's own Go source (object/token_jwt.go,
// UserShort's json tags), not just observed from one token.
export interface CasdoorClaims {
  sub: string
  name?: string
  displayName?: string
  email?: string
  avatar?: string
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

async function getJwks() {
  if (!jwks) {
    const discovery = await getDiscovery()
    jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
  }
  return jwks
}

export async function verifyIdToken(idToken: string): Promise<CasdoorClaims> {
  const discovery = await getDiscovery()
  const { payload } = await jwtVerify(idToken, await getJwks(), {
    issuer: discovery.issuer,
  })
  return payload as unknown as CasdoorClaims
}
