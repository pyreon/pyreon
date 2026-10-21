import { base64url, decodeBase64url, randomToken } from './pkce'
import { timingSafeEqual } from './oidc'

const MAX_COOKIE_BYTES = 4096
const enc = new TextEncoder()
const dec = new TextDecoder()

export interface SessionOptions {
  /** One or more secrets (>= 32 chars). The first signs; all verify, so secrets can rotate. */
  secrets: readonly string[]
  /** Lifetime in seconds. Default 8h. */
  maxAge?: number
  /**
   * Revocation check, run by `verifySession` after the signature and expiry pass.
   * A signed cookie is otherwise valid until it expires — return true for a `jti`
   * you have revoked (logout everywhere, a stolen session) to reject it early.
   * Store revoked ids until their session's `exp`, then drop them.
   */
  isRevoked?: (jti: string, payload: SessionPayload) => boolean | Promise<boolean>
}

export interface SessionPayload {
  sub: string
  [k: string]: unknown
}

function checkSecrets(secrets: readonly string[]): void {
  if (secrets.length === 0 || secrets.some((s) => s.length < 32)) {
    throw new Error('[Pyreon] auth: session secrets must be at least 32 characters')
  }
}

const unb64 = decodeBase64url

// Imported HMAC keys per secret. Signing and verifying run on every request, and
// re-importing the key each time was the dominant cost. Secrets are configuration
// (a handful, rotated rarely); the cap only guards against a caller generating them.
const MAX_CACHED_SECRETS = 32
const hmacKeys = new Map<string, Promise<CryptoKey>>()
function hmacKey(secret: string): Promise<CryptoKey> {
  let k = hmacKeys.get(secret)
  if (k === undefined) {
    if (hmacKeys.size >= MAX_CACHED_SECRETS) hmacKeys.clear()
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    hmacKeys.set(secret, k)
  }
  return k
}

const hmac = async (secret: string, data: string) =>
  base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data))))

/** Sign a session into a cookie-safe `payload.signature` string (HMAC-SHA256, expiry inside the signed body). */
export async function signSession(payload: SessionPayload, opts: SessionOptions, now = Date.now()): Promise<string> {
  checkSecrets(opts.secrets)
  const body = base64url(enc.encode(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + (opts.maxAge ?? 28_800), jti: randomToken(8) })))
  const value = `${body}.${await hmac(opts.secrets[0]!, body)}`
  if (value.length > MAX_COOKIE_BYTES) throw new Error('[Pyreon] auth: session exceeds the 4096-byte cookie limit — store a session id instead')
  return value
}

/** Verify and decode. Returns null for a tampered, expired or malformed value — never throws on bad input. */
export async function verifySession(value: string, opts: SessionOptions, now = Date.now()): Promise<SessionPayload | null> {
  checkSecrets(opts.secrets)
  const dot = value.indexOf('.')
  if (dot < 1 || value.length > MAX_COOKIE_BYTES) return null
  const body = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  let ok = false
  for (const s of opts.secrets) ok = timingSafeEqual(await hmac(s, body), sig) || ok
  if (!ok) return null
  try {
    const p = JSON.parse(dec.decode(unb64(body))) as SessionPayload & { exp?: number; jti?: unknown }
    if (p === null || typeof p !== 'object') return null
    if (typeof p.exp !== 'number' || p.exp * 1000 <= now || typeof p.sub !== 'string') return null
    if (opts.isRevoked) {
      if (typeof p.jti !== 'string' || (await opts.isRevoked(p.jti, p))) return null
    }
    return p
  } catch {
    return null
  }
}

/** `Set-Cookie` with secure defaults: HttpOnly, Secure, SameSite=Lax, host-prefixed. */
export function sessionCookie(name: string, value: string, maxAge = 28_800): string {
  return `__Host-${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}
