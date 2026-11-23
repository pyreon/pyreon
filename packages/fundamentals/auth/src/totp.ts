import { timingSafeEqual } from './oidc'

/** RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s) on Web Crypto — compatible with Google Authenticator and friends. */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(s: string): Uint8Array<ArrayBuffer> {
  let end = s.length
  while (end > 0 && s[end - 1] === '=') end--
  const clean = s.slice(0, end).replace(/\s/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const i = B32.indexOf(ch)
    if (i < 0) throw new Error('[Pyreon] auth: invalid base32 secret')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return new Uint8Array(out)
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]

  return out
}

/** A fresh 160-bit secret, base32 (what you show as a QR / setup key). */
export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)))
}

function hotpKey(secret: string): Promise<CryptoKey> {
  const raw = base32Decode(secret)
  // An empty secret makes every code predictable: a setup error, not a wrong code.
  if (raw.length === 0) throw new Error('[Pyreon] auth: TOTP secret is empty — store the generateTotpSecret() value')
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
}

/** TOTP parameters. Both sides must agree: authenticator apps default to 30 s and 6 digits. */
export interface TotpOptions {
  /** Time step in seconds. Default 30. */
  period?: number | undefined
  /** Code length, 6 to 8. Default 6. */
  digits?: number | undefined
}

function params(opts: TotpOptions): { period: number; digits: number } {
  const period = opts.period ?? 30
  const digits = opts.digits ?? 6
  if (!Number.isInteger(period) || period <= 0) throw new Error('[Pyreon] auth: TOTP period must be a positive whole number of seconds')
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) throw new Error('[Pyreon] auth: TOTP digits must be 6, 7 or 8')

  return { period, digits }
}

async function hotp(key: CryptoKey, counter: number, digits: number): Promise<string> {
  const msg = new Uint8Array(8)
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter))
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const o = h[h.length - 1]! & 0xf
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!

  return String(bin % 10 ** digits).padStart(digits, '0')
}

/** The current code for `secret` (base32). Throws on an empty secret or invalid parameters. */
export async function totp(secret: string, opts: TotpOptions & { now?: number | undefined } = {}): Promise<string> {
  const { period, digits } = params(opts)
  return hotp(await hotpKey(secret), Math.floor((opts.now ?? Date.now()) / 1000 / period), digits)
}

/**
 * Verify a code within ±`window` steps (default 1). Returns the matched step counter so the caller
 * can store it and reject replay of the same code (a code must be single-use).
 */
export async function verifyTotp(
  secret: string,
  code: string,
  opts: TotpOptions & { now?: number | undefined; window?: number | undefined; lastUsedStep?: number | undefined } = {},
): Promise<{ ok: true; step: number } | { ok: false }> {
  const { period, digits } = params(opts)
  // The key first: an empty secret throws instead of reading as a wrong code.
  const key = await hotpKey(secret)
  if (code.length !== digits || !/^\d+$/.test(code)) return { ok: false }
  const now = opts.now ?? Date.now()
  const base = Math.floor(now / 1000 / period)
  const w = opts.window ?? 1
  let hit = -1
  for (let d = -w; d <= w; d++) {
    const step = base + d
    if (timingSafeEqual(await hotp(key, step, digits), code)) hit = step
  }
  if (hit < 0 || (opts.lastUsedStep !== undefined && hit <= opts.lastUsedStep)) return { ok: false }

  return { ok: true, step: hit }
}
