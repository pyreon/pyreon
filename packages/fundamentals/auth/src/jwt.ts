import { AuthError, timingSafeEqual } from './oidc'
import type { FetchLike, OidcMetadata } from './oidc'

/** A JSON Web Key as published in a provider's JWKS. */
export type Jwk = JsonWebKey & { kid?: string; use?: string }

export interface IdTokenClaims {
  iss: string
  sub: string
  aud: string | string[]
  exp: number
  iat?: number
  nonce?: string
  [k: string]: unknown
}

export interface VerifyOptions {
  clientId: string
  nonce?: string
  /** Allowed clock skew in seconds. Default 60. */
  skew?: number
  now?: number
}

const dec = new TextDecoder()
const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}
const part = <T>(s: string): T => JSON.parse(dec.decode(unb64(s))) as T

// `none` and every HS* alg are deliberately absent (RFC 8725 §3.1/§3.2: no alg confusion).
const ALGS = {
  RS256: { import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' } },
  ES256: { import: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' } },
} as const

export async function fetchJwks(meta: OidcMetadata, fetchImpl: FetchLike = (i, o) => fetch(i, o)): Promise<Jwk[]> {
  if (!meta.jwks_uri) throw new AuthError('no_jwks', 'provider metadata has no jwks_uri')
  if (!meta.jwks_uri.startsWith('https://')) throw new AuthError('insecure_url', 'jwks_uri must be https')
  const res = await fetchImpl(meta.jwks_uri, { redirect: 'error' })
  if (!res.ok) throw new AuthError('jwks_failed', `jwks returned ${res.status}`)
  return ((await res.json()) as { keys: Jwk[] }).keys
}

/**
 * Verify an ID token: algorithm allowlist, signature against the issuer's key (selected by `kid`
 * and the header alg — never by trusting the token), then iss / aud / exp / nonce.
 */
export async function verifyIdToken(
  token: string,
  keys: readonly Jwk[],
  meta: OidcMetadata,
  opts: VerifyOptions,
): Promise<IdTokenClaims> {
  const bad = (code: string, msg: string) => new AuthError(code, msg)
  const segs = token.split('.')
  if (segs.length !== 3) throw bad('bad_token', 'not a compact JWS')
  let header: { alg?: string; kid?: string }
  let claims: IdTokenClaims
  try {
    header = part(segs[0]!)
    claims = part(segs[1]!)
  } catch {
    throw bad('bad_token', 'token is not valid JSON')
  }
  const alg = header.alg as keyof typeof ALGS
  if (!alg || !Object.hasOwn(ALGS, alg)) throw bad('bad_alg', `unsupported alg "${String(header.alg)}"`)
  const candidates = keys.filter(
    (k) => (!header.kid || k.kid === header.kid) && (!k.alg || k.alg === alg) && (!k.use || k.use === 'sig') && k.kty === (alg === 'RS256' ? 'RSA' : 'EC'),
  )
  if (candidates.length === 0) throw bad('no_key', 'no matching signing key')
  const spec = ALGS[alg]
  let valid = false
  for (const jwk of candidates) {
    const key = await crypto.subtle.importKey('jwk', jwk, spec.import, false, ['verify'])
    if (await crypto.subtle.verify(spec.verify, key, unb64(segs[2]!), new TextEncoder().encode(`${segs[0]}.${segs[1]}`))) {
      valid = true
      break
    }
  }
  if (!valid) throw bad('bad_signature', 'signature verification failed')
  const now = Math.floor((opts.now ?? Date.now()) / 1000)
  const skew = opts.skew ?? 60
  if (claims.iss !== meta.issuer) throw bad('bad_iss', 'iss does not match the provider')
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.includes(opts.clientId)) throw bad('bad_aud', 'aud does not include this client')
  if (aud.length > 1 && claims.azp !== opts.clientId) throw bad('bad_azp', 'multi-audience token needs azp = client')
  if (typeof claims.exp !== 'number' || claims.exp + skew < now) throw bad('expired', 'token expired')
  if (typeof claims.sub !== 'string' || !claims.sub) throw bad('bad_token', 'missing sub')
  if (opts.nonce !== undefined && !timingSafeEqual(String(claims.nonce ?? ''), opts.nonce)) throw bad('bad_nonce', 'nonce mismatch')
  return claims
}
