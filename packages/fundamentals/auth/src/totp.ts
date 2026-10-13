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

export async function totp(secret: string, now = Date.now(), step = 30, digits = 6): Promise<string> {
  const counter = Math.floor(now / 1000 / step)
  const msg = new Uint8Array(8)
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter))
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const o = h[h.length - 1]! & 0xf
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!
  return String(bin % 10 ** digits).padStart(digits, '0')
}

/**
 * Verify a code within ±`window` steps (default 1). Returns the matched step counter so the caller
 * can store it and reject replay of the same code (a code must be single-use).
 */
export async function verifyTotp(
  secret: string,
  code: string,
  opts: { now?: number; window?: number; lastUsedStep?: number } = {},
): Promise<{ ok: true; step: number } | { ok: false }> {
  if (!/^\d{6}$/.test(code)) return { ok: false }
  const now = opts.now ?? Date.now()
  const base = Math.floor(now / 1000 / 30)
  const w = opts.window ?? 1
  let hit = -1
  for (let d = -w; d <= w; d++) {
    const step = base + d
    if (timingSafeEqual(await totp(secret, step * 30_000), code)) hit = step
  }
  if (hit < 0 || (opts.lastUsedStep !== undefined && hit <= opts.lastUsedStep)) return { ok: false }
  return { ok: true, step: hit }
}
