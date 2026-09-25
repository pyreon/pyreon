/**
 * The signed-cookie primitives under sessions + preview mode. The middleware
 * suites exercise the happy path; these pin the REJECTION contract of
 * `verify` (every malformed shape reads as `null`, never throws), the exact
 * `Set-Cookie` serialization, and the `Vary` merge in `markPrivate`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSigner,
  markPrivate,
  readCookie,
  serializeCookie,
} from '../utils/signed-cookie'

const SECRET = 's'.repeat(32)
const enc = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * A value carrying a VALID MAC over an arbitrary body — so the checks that
 * run AFTER signature verification (body decode, JSON parse, expiry) are
 * reached, which a forged/garbage cookie never does.
 */
async function macOver(body: string, purpose = 'pyreon-session'): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${purpose}\0${body}`)))
  return `${body}.${b64url(sig)}`
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createSigner.verify — rejects every malformed value as null', () => {
  const signer = createSigner([SECRET], 'pyreon-session')

  it('a correctly signed, unexpired value round-trips', async () => {
    const v = await signer.sign({ a: 1 }, 60)
    expect(await signer.verify(v)).toEqual({ a: 1 })
  })

  it('a signature segment with non-base64url characters is rejected before any MAC work', async () => {
    const v = await signer.sign({ a: 1 }, 60)
    const [body] = v.split('.')
    expect(await signer.verify(`${body}.not+base64/url=`)).toBeNull()
  })

  it('a validly MAC-ed body that is not base64url is rejected', async () => {
    expect(await signer.verify(await macOver('bad*body'))).toBeNull()
  })

  it('a validly MAC-ed body that is not JSON is rejected (no throw)', async () => {
    expect(await signer.verify(await macOver(b64url(enc.encode('{not json'))))).toBeNull()
  })

  it('a validly MAC-ed payload without a numeric expiry is rejected', async () => {
    const body = b64url(enc.encode(JSON.stringify({ d: { a: 1 } })))
    expect(await signer.verify(await macOver(body))).toBeNull()
  })

  it('a validly MAC-ed, unexpired payload with no `d` reads as null', async () => {
    const body = b64url(enc.encode(JSON.stringify({ e: Date.now() + 60_000 })))
    expect(await signer.verify(await macOver(body))).toBeNull()
  })

  it('a MAC minted for another purpose does not verify', async () => {
    const body = b64url(enc.encode(JSON.stringify({ d: 1, e: Date.now() + 60_000 })))
    expect(await signer.verify(await macOver(body, 'pyreon-preview'))).toBeNull()
  })

  it('throws a [Pyreon] error when Web Crypto is unavailable', () => {
    vi.stubGlobal('crypto', {})
    expect(() => createSigner([SECRET], 'pyreon-session')).toThrow(/\[Pyreon\] Signed cookies need Web Crypto/)
  })
})

describe('serializeCookie', () => {
  it('defaults the path to / and emits no optional attributes', () => {
    expect(serializeCookie('n', 'v', {})).toBe('n=v; Path=/')
  })

  it('emits every attribute in a stable order, capitalising SameSite', () => {
    expect(
      serializeCookie('n', 'v', {
        path: '/app',
        domain: 'x.test',
        maxAge: 10.9,
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
      }),
    ).toBe('n=v; Path=/app; Domain=x.test; Max-Age=10; HttpOnly; Secure; SameSite=Strict')
  })

  it('an expiring cookie (maxAge 0) also carries a past Expires; a negative maxAge clamps to 0', () => {
    expect(serializeCookie('n', '', { maxAge: 0 })).toBe(
      'n=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    )
    expect(serializeCookie('n', '', { maxAge: -5 })).toBe('n=; Path=/; Max-Age=0')
  })
})

describe('readCookie', () => {
  it('finds the named cookie among others, ignoring fragments with no `=`', () => {
    const req = new Request('https://x.test/', { headers: { cookie: 'junk; a=1; target = v2 ; b=3' } })
    expect(readCookie(req, 'target')).toBe('v2')
    expect(readCookie(req, 'missing')).toBeNull()
  })

  it('returns null when the request carries no Cookie header', () => {
    expect(readCookie(new Request('https://x.test/'), 'a')).toBeNull()
  })
})

describe('markPrivate', () => {
  it('appends Cookie to an existing Vary instead of replacing it', () => {
    const h = new Headers({ vary: 'Accept-Encoding' })
    markPrivate(h)
    expect(h.get('cache-control')).toBe('private, no-store')
    expect(h.get('vary')).toBe('Accept-Encoding, Cookie')
  })

  it('does not duplicate Cookie when Vary already names it (case-insensitive)', () => {
    const h = new Headers({ vary: 'Accept, cookie' })
    markPrivate(h)
    expect(h.get('vary')).toBe('Accept, cookie')
  })
})
