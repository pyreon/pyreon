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
  /**
   * Extra authorization-request parameters — `prompt`, `login_hint`, `ui_locales`,
   * or a provider's own (Google issues a refresh token only with
   * `access_type: 'offline'`). Cannot override the parameters that carry the
   * flow's security (`state`, `nonce`, PKCE, `redirect_uri`, …): passing one throws.
   */
  authorizationParams?: Record<string, string>
}

const RESERVED_PARAMS = new Set([
  'response_type',
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'nonce',
  'code_challenge',
  'code_challenge_method',
])

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

/**
 * One request. A transport failure (no network, DNS, TLS, a refused redirect) becomes
 * `network_error` — the same code the native transports report — instead of escaping as
 * a raw TypeError that the state machine could only call `unknown`.
 */
export async function send(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, init)
  } catch {
    throw new AuthError('network_error', `request to ${url.split('?')[0]} failed`)
  }
}

const isLoopback = (u: URL) => u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'

/** https, or http on a loopback host (local development). One rule for every endpoint. */
export function assertHttps(url: string, what: string): URL {
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
  const res = await send(fetchImpl, url, { redirect: 'error', headers: { accept: 'application/json' } })
  if (!res.ok) throw new AuthError('discovery_failed', `discovery returned ${res.status}`)
  let meta: OidcMetadata
  try {
    meta = (await res.json()) as OidcMetadata
  } catch {
    throw new AuthError('discovery_failed', 'discovery document is not JSON')
  }
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new AuthError('discovery_failed', 'discovery document is not a JSON object')
  }
  if (meta.issuer !== issuer.replace(/\/$/, '') && meta.issuer !== issuer) {
    throw new AuthError('issuer_mismatch', `discovery issuer "${meta.issuer}" does not match "${issuer}"`)
  }
  if (typeof meta.authorization_endpoint !== 'string' || typeof meta.token_endpoint !== 'string') {
    throw new AuthError('discovery_failed', 'discovery document lacks authorization_endpoint / token_endpoint')
  }
  assertHttps(meta.authorization_endpoint, 'authorization_endpoint')
  assertHttps(meta.token_endpoint, 'token_endpoint')
  // Optional endpoints must be https too when present. jwks_uri matters most:
  // it is where the ID-token signing keys come from.
  for (const k of ['jwks_uri', 'userinfo_endpoint', 'end_session_endpoint'] as const) {
    const v = meta[k]
    if (v !== undefined) assertHttps(String(v), k)
  }
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
  for (const [k, v] of Object.entries(client.authorizationParams ?? {})) {
    if (RESERVED_PARAMS.has(k)) {
      throw new AuthError('reserved_param', `authorizationParams cannot set "${k}" — it is managed by the flow`)
    }
    u.searchParams.set(k, v)
  }
  return { url: u.toString(), flow }
}

/** How long a pending flow stays valid (and how long a flow store needs to keep it). */
export const FLOW_TTL_MS = 10 * 60_000

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

/**
 * POST to the token endpoint and validate the response: JSON object, a non-empty
 * `access_token`, `token_type` Bearer. Shared by the code exchange and refresh so
 * both paths enforce the same rules.
 */
async function postToken(
  meta: OidcMetadata,
  body: Record<string, string>,
  fetchImpl: FetchLike,
): Promise<TokenResponse> {
  const res = await send(fetchImpl, meta.token_endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(body),
  })
  if (!res.ok) throw new AuthError('token_exchange_failed', `token endpoint returned ${res.status}`)
  let tokens: TokenResponse
  try {
    tokens = (await res.json()) as TokenResponse
  } catch {
    throw new AuthError('bad_token_response', 'token response is not JSON')
  }
  if (tokens === null || typeof tokens !== 'object') {
    throw new AuthError('bad_token_response', 'token response is not a JSON object')
  }
  if (typeof tokens.access_token !== 'string' || !tokens.access_token || String(tokens.token_type).toLowerCase() !== 'bearer') {
    throw new AuthError('bad_token_response', 'token response missing a bearer access_token')
  }
  return tokens
}

/** Exchange the code (PKCE verifier, no client secret — public client). */
export function exchangeCode(
  meta: OidcMetadata,
  client: ClientConfig,
  flow: PendingFlow,
  code: string,
  fetchImpl: FetchLike = (i, o) => fetch(i, o),
): Promise<TokenResponse> {
  return postToken(
    meta,
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: flow.redirectUri,
      client_id: client.clientId,
      code_verifier: flow.codeVerifier,
    },
    fetchImpl,
  )
}

/**
 * Exchange a refresh token for fresh tokens (public client). The provider may
 * rotate the refresh token; when the response carries none, keep using the old one.
 */
export function refreshTokens(
  meta: OidcMetadata,
  client: ClientConfig,
  refreshToken: string,
  fetchImpl: FetchLike = (i, o) => fetch(i, o),
): Promise<TokenResponse> {
  return postToken(meta, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: client.clientId }, fetchImpl)
}

/**
 * RP-initiated logout URL (OpenID Connect RP-Initiated Logout 1.0), or null when
 * the provider advertises no `end_session_endpoint`. Navigate the user agent there
 * to end the session AT THE PROVIDER — clearing local state alone leaves the user
 * signed in at Google/Keycloak, and the next sign-in completes without a prompt.
 */
export function endSessionUrl(
  meta: OidcMetadata,
  opts: { idTokenHint?: string; postLogoutRedirectUri?: string; clientId?: string; state?: string } = {},
): string | null {
  if (!meta.end_session_endpoint) return null
  const u = new URL(assertHttps(meta.end_session_endpoint, 'end_session_endpoint').href)
  if (opts.idTokenHint) u.searchParams.set('id_token_hint', opts.idTokenHint)
  if (opts.clientId) u.searchParams.set('client_id', opts.clientId)
  if (opts.postLogoutRedirectUri) u.searchParams.set('post_logout_redirect_uri', opts.postLogoutRedirectUri)
  if (opts.state) u.searchParams.set('state', opts.state)
  return u.toString()
}
