/**
 * HMAC-SHA256 signed cookie values — shared by sessions and preview mode.
 *
 * Web Crypto only (`globalThis.crypto.subtle`), so the same code runs on Node
 * ≥ 18, Bun, Deno and Cloudflare workerd, and the module is safe to import
 * from client-reachable code (no `node:*` import).
 *
 * Wire format: `<base64url(JSON payload)>.<base64url(HMAC-SHA256)>`.
 * The payload carries an absolute expiry (`e`, ms since epoch) so a cookie
 * that outlives its `Max-Age` on a misbehaving client is still rejected
 * server-side — `Max-Age` is advisory, the signature+expiry is the contract.
 *
 * Key rotation: `secrets[0]` signs, EVERY secret verifies. Rotate by
 * prepending the new secret and dropping the oldest after one max-age.
 */

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Minimum secret length (bytes of UTF-8) — HMAC-SHA256 wants ≥ 32. */
export const MIN_SECRET_LENGTH = 32

export function normalizeSecrets(secret: string | readonly string[], who: string): string[] {
  const list = typeof secret === 'string' ? [secret] : [...secret]
  if (list.length === 0) {
    throw new Error(`[Pyreon] ${who}: \`secret\` is empty — pass at least one secret (≥ ${MIN_SECRET_LENGTH} chars).`)
  }
  for (const s of list) {
    if (typeof s !== 'string' || enc.encode(s).length < MIN_SECRET_LENGTH) {
      throw new Error(
        `[Pyreon] ${who}: every secret must be a string of at least ${MIN_SECRET_LENGTH} characters. `
        + 'Generate one with `openssl rand -base64 32` and load it from an environment variable.',
      )
    }
  }
  return list
}

function toB64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/**
 * A signer bound to one secret list. Imported `CryptoKey`s are cached PER
 * SIGNER (bounded by the secret count — never a module-level cache).
 */
export interface Signer {
  sign(payload: unknown, maxAgeSeconds: number): Promise<string>
  /** Returns the payload, or `null` for a missing / tampered / expired value. */
  verify(value: string | null | undefined): Promise<unknown>
}

export function createSigner(secrets: readonly string[]): Signer {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('[Pyreon] Signed cookies need Web Crypto (`globalThis.crypto.subtle`) — Node ≥ 18, Bun, Deno and workerd all provide it.')
  }
  const keys = secrets.map((s) =>
    subtle.importKey('raw', enc.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
  )
  return {
    async sign(payload, maxAgeSeconds) {
      const body = toB64url(enc.encode(JSON.stringify({ d: payload, e: Date.now() + maxAgeSeconds * 1000 })))
      const sig = new Uint8Array(await subtle.sign('HMAC', await keys[0]!, enc.encode(body)))
      return `${body}.${toB64url(sig)}`
    },
    async verify(value) {
      if (!value) return null
      const dot = value.indexOf('.')
      if (dot <= 0 || dot !== value.lastIndexOf('.')) return null
      const body = value.slice(0, dot)
      const sig = fromB64url(value.slice(dot + 1))
      if (!sig || sig.length !== 32) return null
      let ok = false
      // `subtle.verify` compares in constant time; try every rotation key.
      for (const key of keys) {
        if (await subtle.verify('HMAC', await key, sig, enc.encode(body))) {
          ok = true
          break
        }
      }
      if (!ok) return null
      const raw = fromB64url(body)
      if (!raw) return null
      try {
        const parsed = JSON.parse(dec.decode(raw)) as { d?: unknown; e?: unknown }
        if (typeof parsed.e !== 'number' || parsed.e < Date.now()) return null
        return parsed.d ?? null
      } catch {
        return null
      }
    },
  }
}

export interface CookieAttributes {
  path?: string
  domain?: string
  maxAge?: number
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
}

export function serializeCookie(name: string, value: string, a: CookieAttributes): string {
  let out = `${name}=${value}; Path=${a.path ?? '/'}`
  if (a.domain) out += `; Domain=${a.domain}`
  if (a.maxAge !== undefined) out += `; Max-Age=${Math.max(0, Math.floor(a.maxAge))}`
  if (a.maxAge === 0) out += '; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  if (a.httpOnly) out += '; HttpOnly'
  if (a.secure) out += '; Secure'
  if (a.sameSite) out += `; SameSite=${a.sameSite[0]!.toUpperCase()}${a.sameSite.slice(1)}`
  return out
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

/**
 * Replace (not append to) any `Set-Cookie` for `name` in `headers`, keeping
 * every other cookie. Headers has no per-value delete for `set-cookie`.
 */
export function replaceSetCookie(headers: Headers, name: string, cookie: string): void {
  const others = headers.getSetCookie().filter((c) => !c.startsWith(`${name}=`))
  headers.delete('set-cookie')
  for (const c of others) headers.append('set-cookie', c)
  headers.append('set-cookie', cookie)
}

/**
 * Mark a response private: any per-user state was read or written while it
 * was produced. `Cache-Control: private` is an UNCONDITIONAL disqualifier in
 * `createISRHandler`'s cacheability check (even with a custom `cacheKey`), and
 * shared HTTP caches (CDNs) honour it too.
 */
export function markPrivate(headers: Headers): void {
  headers.set('cache-control', 'private, no-store')
  const vary = headers.get('vary') ?? ''
  if (!vary.toLowerCase().split(',').some((t) => t.trim() === 'cookie')) {
    headers.set('vary', vary ? `${vary}, Cookie` : 'Cookie')
  }
}
