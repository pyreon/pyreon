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

// Imported verification keys, keyed by the JWK object (a JWKS is usually fetched
// once and reused, so the same objects come back). Weak: entries die with the JWK.
const keyCache = new WeakMap<object, Promise<CryptoKey>>()
function importVerifyKey(jwk: Jwk, alg: (typeof ALGS)[keyof typeof ALGS]['import']): Promise<CryptoKey> {
  let p = keyCache.get(jwk)
  if (p === undefined) {
    p = crypto.subtle.importKey('jwk', jwk, alg, false, ['verify'])
    // A failed import must not stay cached as a rejected promise.
    p.catch(() => keyCache.delete(jwk))
    keyCache.set(jwk, p)
  }
  return p
}

export async function fetchJwks(meta: OidcMetadata, fetchImpl: FetchLike = (i, o) => fetch(i, o)): Promise<Jwk[]> {
  if (!meta.jwks_uri) throw new AuthError('no_jwks', 'provider metadata has no jwks_uri')
  if (!meta.jwks_uri.startsWith('https://')) throw new AuthError('insecure_url', 'jwks_uri must be https')
  const res = await fetchImpl(meta.jwks_uri, { redirect: 'error' })
  if (!res.ok) throw new AuthError('jwks_failed', `jwks returned ${res.status}`)
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new AuthError('jwks_failed', 'jwks document is not JSON')
  }
  const keys = (body as { keys?: unknown } | null)?.keys
  if (!Array.isArray(keys)) throw new AuthError('jwks_failed', 'jwks document has no keys array')
  return keys as Jwk[]
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
  let header: { alg?: string; kid?: string; crit?: unknown }
  let claims: IdTokenClaims
  try {
    header = part(segs[0]!)
    claims = part(segs[1]!)
  } catch {
    throw bad('bad_token', 'token is not valid JSON')
  }
  const isObject = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v)
  if (!isObject(header) || !isObject(claims)) throw bad('bad_token', 'token header and payload must be JSON objects')
  // RFC 7515 §4.1.11: a recipient that does not understand a `crit` extension MUST
  // reject the token. This verifier understands none.
  if (header.crit !== undefined) throw bad('bad_token', 'token declares critical header extensions')
  const alg = header.alg as keyof typeof ALGS
  if (!alg || !Object.hasOwn(ALGS, alg)) throw bad('bad_alg', `unsupported alg "${String(header.alg)}"`)
  const candidates = keys.filter(
    (k) => k !== null && typeof k === 'object' && (!header.kid || k.kid === header.kid) && (!k.alg || k.alg === alg) && (!k.use || k.use === 'sig') && k.kty === (alg === 'RS256' ? 'RSA' : 'EC'),
  )
  if (candidates.length === 0) throw bad('no_key', 'no matching signing key')
  const spec = ALGS[alg]
  let signature: Uint8Array<ArrayBuffer>
  try {
    signature = unb64(segs[2]!)
  } catch {
    throw bad('bad_signature', 'signature is not base64url')
  }
  const signingInput = new TextEncoder().encode(`${segs[0]}.${segs[1]}`)
  let valid = false
  for (const jwk of candidates) {
    let key: CryptoKey
    try {
      key = await importVerifyKey(jwk, spec.import)
    } catch {
      continue // a malformed published key cannot verify anything
    }
    if (await crypto.subtle.verify(spec.verify, key, signature, signingInput)) {
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
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf - skew > now)) {
    throw bad('not_yet_valid', 'token is not valid yet (nbf)')
  }
  if (typeof claims.sub !== 'string' || !claims.sub) throw bad('bad_token', 'missing sub')
  if (opts.nonce !== undefined && !timingSafeEqual(String(claims.nonce ?? ''), opts.nonce)) throw bad('bad_nonce', 'nonce mismatch')
  return claims
}
