import { AuthError, assertHttps, send, timingSafeEqual } from './oidc'
import type { FetchLike, OidcMetadata } from './oidc'
import { decodeBase64url } from './pkce'

/** A JSON Web Key as published in a provider's JWKS. */
export type Jwk = JsonWebKey & { kid?: string; use?: string }

/** Smallest RSA modulus a published key may have (RFC 8725 §3.5; NIST SP 800-131A). */
const MIN_RSA_BITS = 2048

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
  /**
   * Refuse a token issued (`iat`) longer ago than this many seconds — for a sign-in you expect
   * to have just happened. Requires `iat`. Default: no age limit (expiry still applies).
   */
  maxAge?: number
  now?: number
}

// fatal: invalid UTF-8 is a malformed token, not text to repair with U+FFFD.
const dec = new TextDecoder('utf-8', { fatal: true })
const unb64 = decodeBase64url
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
    // Import the key MATERIAL only. `alg` / `use` were already applied when this key was
    // chosen (an unset value — absent, null or "" — matches); WebCrypto would instead reject
    // a key that merely carries `"alg": ""`, which the native verifiers accept.
    const material: JsonWebKey = {}
    for (const f of jwk.kty === 'RSA' ? (['kty', 'n', 'e'] as const) : (['kty', 'crv', 'x', 'y'] as const)) {
      const v = jwk[f]
      if (typeof v === 'string') material[f] = v
    }
    p = crypto.subtle.importKey('jwk', material, alg, false, ['verify'])
    // A failed import must not stay cached as a rejected promise.
    p.catch(() => keyCache.delete(jwk))
    keyCache.set(jwk, p)
  }

  return p
}

export async function fetchJwks(meta: OidcMetadata, fetchImpl: FetchLike = (i, o) => fetch(i, o)): Promise<Jwk[]> {
  if (!meta.jwks_uri) throw new AuthError('no_jwks', 'provider metadata has no jwks_uri')
  // Same rule as discovery: https, or loopback http for a local dev provider.
  assertHttps(meta.jwks_uri, 'jwks_uri')
  const res = await send(fetchImpl, meta.jwks_uri, { redirect: 'error' })
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

export interface JwksCacheOptions {
  /** Re-fetch the key set after this long even if every kid is known. Default 1 hour. */
  maxAgeMs?: number
  /**
   * Minimum gap between fetches triggered by an UNKNOWN kid. A token naming a kid we
   * have not seen triggers one re-fetch (the provider rotated its keys); this throttle
   * stops a flood of tokens with made-up kids from turning into a flood of requests to
   * the provider. Default 60 seconds.
   */
  minRefreshMs?: number
  /** Clock, for tests. */
  now?: () => number
}

export interface JwksCache {
  /** The current key set, re-fetched once when `kid` is not in it (key rotation). */
  keys(kid?: string): Promise<Jwk[]>
  /**
   * Re-fetch now, unless a fetch happened within the throttle window (then `null`). Used when a
   * token verified against the cached keys fails — e.g. a token without `kid` right after rotation.
   */
  refresh(): Promise<Jwk[] | null>
}

/**
 * A provider's JWKS, cached. Concurrent callers share one in-flight fetch, a failed
 * fetch is not cached (the next call retries), and a token naming an unknown `kid`
 * triggers a throttled re-fetch so key rotation works without a restart.
 */
export function createJwksCache(
  meta: OidcMetadata,
  fetchImpl: FetchLike = (i, o) => fetch(i, o),
  opts: JwksCacheOptions = {},
): JwksCache {
  const maxAge = opts.maxAgeMs ?? 3_600_000
  const minRefresh = opts.minRefreshMs ?? 60_000
  const now = opts.now ?? Date.now
  let cached: Jwk[] | null = null
  let fetchedAt = 0
  let inflight: Promise<Jwk[]> | null = null

  const load = (): Promise<Jwk[]> => {
    if (inflight) return inflight
    const p = fetchJwks(meta, fetchImpl).then(
      (k) => {
        cached = k
        fetchedAt = now()
        return k
      },
    )
    inflight = p
    // Clear the in-flight slot on BOTH settle paths — a rejected promise left here
    // would be returned to every later caller forever.
    p.then(
      () => {
        if (inflight === p) inflight = null
      },
      () => {
        if (inflight === p) inflight = null
      },
    )

    return p
  }

  return {
    async keys(kid) {
      if (cached === null || now() - fetchedAt > maxAge) return load()
      if (kid !== undefined && !cached.some((k) => k.kid === kid) && now() - fetchedAt >= minRefresh) {
        return load()
      }

      return cached
    },
    async refresh() {
      if (cached !== null && now() - fetchedAt < minRefresh) return null
      return load()
    },
  }
}

/** The `kid` a compact JWS names in its header, or undefined. Unverified — used only to pick a key. */
export function tokenKid(token: string): string | undefined {
  try {
    const h = part<{ kid?: unknown }>(token.split('.')[0] ?? '')
    return typeof h?.kid === 'string' ? h.kid : undefined
  } catch {
    return undefined
  }
}

const isJwksCache = (k: readonly Jwk[] | JwksCache): k is JwksCache => !Array.isArray(k)

/**
 * Verify an ID token: algorithm allowlist, signature against the issuer's key (selected by `kid`
 * and the header alg — never by trusting the token), then iss / aud / azp / exp / nbf / iat / sub /
 * nonce. `keys` is a key set, or a `createJwksCache` cache: with a cache, a token that fails
 * against the cached keys (rotation, or a token without `kid`) triggers ONE throttled re-fetch
 * and a retry.
 */
export async function verifyIdToken(
  token: string,
  keys: readonly Jwk[] | JwksCache,
  meta: OidcMetadata,
  opts: VerifyOptions,
): Promise<IdTokenClaims> {
  if (!isJwksCache(keys)) return verifyWithKeys(token, keys, meta, opts)
  const cache = keys
  try {
    return await verifyWithKeys(token, await cache.keys(tokenKid(token)), meta, opts)
  } catch (e) {
    if (!(e instanceof AuthError) || (e.code !== 'no_key' && e.code !== 'bad_signature')) throw e
    const fresh = await cache.refresh()
    if (fresh === null) throw e

    return verifyWithKeys(token, fresh, meta, opts)
  }
}

/** Modulus size of an RSA JWK in bits, or 0 when it is unreadable. */
function rsaBits(n: unknown): number {
  if (typeof n !== 'string') return 0
  try {
    const b = decodeBase64url(n)
    let i = 0
    while (i < b.length && b[i] === 0) i++
    if (i === b.length) return 0

    return (b.length - i - 1) * 8 + (32 - Math.clz32(b[i]!))
  } catch {
    return 0
  }
}

async function verifyWithKeys(
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
  // One explicit rule, shared with the native verifiers: a field is UNSET when absent,
  // null or "". A token kid selects keys only when it is a non-empty string; any other
  // value matches nothing. (JS truthiness would also treat false/0 as unset, which the
  // native targets cannot reproduce from typed JSON — so neither target relies on it.)
  const unset = (v: unknown) => v === undefined || v === null || v === ''
  const kid: unknown = header.kid
  const candidates = keys.filter(
    (k) =>
      k !== null &&
      typeof k === 'object' &&
      (unset(kid) || (typeof kid === 'string' && k.kid === kid)) &&
      (unset(k.alg) || k.alg === alg) &&
      (unset(k.use) || k.use === 'sig') &&
      // RFC 7517 §4.3: a key whose key_ops does not include "verify" may not verify.
      (unset(k.key_ops) || (Array.isArray(k.key_ops) && k.key_ops.includes('verify'))) &&
      k.kty === (alg === 'RS256' ? 'RSA' : 'EC') &&
      (k.kty !== 'RSA' || rsaBits(k.n) >= MIN_RSA_BITS),
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
  // OIDC Core §2: azp, when present, is the party the token was issued to — it must be us.
  if (claims.azp !== undefined && claims.azp !== opts.clientId) throw bad('bad_azp', 'token was issued to another client (azp)')
  if (typeof claims.exp !== 'number' || claims.exp + skew < now) throw bad('expired', 'token expired')
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf - skew > now)) {
    throw bad('not_yet_valid', 'token is not valid yet (nbf)')
  }
  // A token issued in the future is as invalid as one not yet valid.
  if (claims.iat !== undefined && (typeof claims.iat !== 'number' || claims.iat - skew > now)) {
    throw bad('not_yet_valid', 'token is issued in the future (iat)')
  }
  if (opts.maxAge !== undefined && (typeof claims.iat !== 'number' || now - claims.iat > opts.maxAge + skew)) {
    throw bad('too_old', 'token was issued too long ago (iat older than maxAge)')
  }
  if (typeof claims.sub !== 'string' || !claims.sub) throw bad('bad_token', 'missing sub')
  // A nonce must be a string; a provider echoing it as a number is not echoing it.
  if (opts.nonce !== undefined && (typeof claims.nonce !== 'string' || !timingSafeEqual(claims.nonce, opts.nonce))) {
    throw bad('bad_nonce', 'nonce mismatch')
  }

  return claims
}
