import { codeChallengeS256, generateCodeVerifier, randomToken } from './pkce'

export interface OidcMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri?: string
  userinfo_endpoint?: string
  end_session_endpoint?: string
  /** RFC 9207 — the AS advertises that it sends `iss` on the redirect. */
  authorization_response_iss_parameter_supported?: boolean
}

export interface ClientConfig {
  clientId: string
  redirectUri: string
  scope?: string
}

/** State that must survive the redirect round trip. Persist server-side or in a short-lived HttpOnly cookie. */
export interface PendingFlow {
  state: string
  nonce: string
  codeVerifier: string
  redirectUri: string
  issuer: string
  createdAt: number
}

/** Minimal fetch shape (also satisfied by `globalThis.fetch`). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class AuthError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(`[Pyreon] auth: ${message}`)
    this.name = 'AuthError'
    this.code = code
  }
}

const isLoopback = (u: URL) => u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'

function assertHttps(url: string, what: string): URL {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new AuthError('invalid_url', `${what} is not a valid URL`)
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLoopback(u))) {
    throw new AuthError('insecure_url', `${what} must be https (got ${u.protocol})`)
  }
  return u
}

/**
 * Fetch + validate OIDC discovery. The returned `issuer` MUST equal the URL it was
 * fetched from (OIDC Discovery §4.3) — otherwise a hostile document could redirect
 * the whole flow. Every advertised endpoint must also be https.
 */
export async function discover(issuer: string, fetchImpl: FetchLike = (i, o) => fetch(i, o)): Promise<OidcMetadata> {
  const base = assertHttps(issuer, 'issuer')
  const url = `${base.origin}${base.pathname.replace(/\/$/, '')}/.well-known/openid-configuration`
  const res = await fetchImpl(url, { redirect: 'error', headers: { accept: 'application/json' } })
  if (!res.ok) throw new AuthError('discovery_failed', `discovery returned ${res.status}`)
  const meta = (await res.json()) as OidcMetadata
  if (meta.issuer !== issuer.replace(/\/$/, '') && meta.issuer !== issuer) {
    throw new AuthError('issuer_mismatch', `discovery issuer "${meta.issuer}" does not match "${issuer}"`)
  }
  assertHttps(meta.authorization_endpoint, 'authorization_endpoint')
  assertHttps(meta.token_endpoint, 'token_endpoint')
  return meta
}

/** Build the authorization redirect (code flow + S256 PKCE + state + nonce). */
export async function beginAuthorization(
  meta: OidcMetadata,
  client: ClientConfig,
  now: number = Date.now(),
): Promise<{ url: string; flow: PendingFlow }> {
  const flow: PendingFlow = {
    state: randomToken(),
    nonce: randomToken(),
    codeVerifier: generateCodeVerifier(),
    redirectUri: client.redirectUri,
    issuer: meta.issuer,
    createdAt: now,
  }
  const u = new URL(meta.authorization_endpoint)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', client.clientId)
  u.searchParams.set('redirect_uri', client.redirectUri)
  u.searchParams.set('scope', client.scope ?? 'openid profile email')
  u.searchParams.set('state', flow.state)
  u.searchParams.set('nonce', flow.nonce)
  u.searchParams.set('code_challenge', await codeChallengeS256(flow.codeVerifier))
  u.searchParams.set('code_challenge_method', 'S256')
  return { url: u.toString(), flow }
}

const FLOW_TTL_MS = 10 * 60_000

/**
 * Validate the redirect back. Order matters: error → state (constant-time) → iss (RFC 9207) → code.
 * Returns the authorization code; the flow is single-use, so the caller must delete it either way.
 */
export function parseCallback(
  callback: string | URL,
  flow: PendingFlow,
  meta: OidcMetadata,
  now: number = Date.now(),
): { code: string } {
  const p = new URL(callback).searchParams
  if (now - flow.createdAt > FLOW_TTL_MS) throw new AuthError('flow_expired', 'authorization attempt expired')
  const err = p.get('error')
  if (err) throw new AuthError('provider_error', `provider returned "${err}"`)
  if (!timingSafeEqual(p.get('state') ?? '', flow.state)) throw new AuthError('state_mismatch', 'state mismatch')
  const iss = p.get('iss')
  if (iss !== null && iss !== meta.issuer) throw new AuthError('issuer_mismatch', 'callback iss mismatch (mix-up)')
  if (iss === null && meta.authorization_response_iss_parameter_supported) {
    throw new AuthError('issuer_missing', 'provider advertises iss but callback omitted it')
  }
  const code = p.get('code')
  if (!code) throw new AuthError('missing_code', 'callback has no code')
  return { code }
}

/** Length-leaking-only comparison; both inputs are non-secret-length tokens we generated. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export interface TokenResponse {
  access_token: string
  token_type: string
  id_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

/** Exchange the code (PKCE verifier, no client secret — public client). */
export async function exchangeCode(
  meta: OidcMetadata,
  client: ClientConfig,
  flow: PendingFlow,
  code: string,
  fetchImpl: FetchLike = (i, o) => fetch(i, o),
): Promise<TokenResponse> {
  const res = await fetchImpl(meta.token_endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: flow.redirectUri,
      client_id: client.clientId,
      code_verifier: flow.codeVerifier,
    }),
  })
  if (!res.ok) throw new AuthError('token_exchange_failed', `token endpoint returned ${res.status}`)
  const tokens = (await res.json()) as TokenResponse
  if (!tokens.access_token || tokens.token_type?.toLowerCase() !== 'bearer') {
    throw new AuthError('bad_token_response', 'token response missing a bearer access_token')
  }
  return tokens
}
