import { describe, expect, it } from 'vitest'
import { base64url, derToRaw, passkeyChallenge, verifyAssertion } from '../index'

const RP = 'app.example'
const ORIGIN = 'https://app.example'

// WebCrypto signs raw r||s; real authenticators send DER, so wrap it.
function rawToDer(raw: Uint8Array): Uint8Array {
  const enc = (v: Uint8Array) => {
    let i = 0
    while (i < v.length - 1 && v[i] === 0) i++
    let x = v.slice(i)
    if (x[0]! & 0x80) x = Uint8Array.from([0, ...x])
    return Uint8Array.from([0x02, x.length, ...x])
  }
  const body = Uint8Array.from([...enc(raw.slice(0, 32)), ...enc(raw.slice(32))])
  return Uint8Array.from([0x30, body.length, ...body])
}

async function authenticator() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publicKey = await crypto.subtle.exportKey('jwk', kp.publicKey)
  const assert = async (o: { challenge: string; type?: string; origin?: string; flags?: number; count?: number; rp?: string; crossOrigin?: boolean }) => {
    const clientData = new TextEncoder().encode(JSON.stringify({ type: o.type ?? 'webauthn.get', challenge: o.challenge, origin: o.origin ?? ORIGIN, ...(o.crossOrigin === undefined ? {} : { crossOrigin: o.crossOrigin }) }))
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(o.rp ?? RP)))
    const auth = new Uint8Array(37)
    auth.set(rpHash, 0)
    auth[32] = o.flags ?? 0x05
    new DataView(auth.buffer).setUint32(33, o.count ?? 1)
    const signed = new Uint8Array([...auth, ...new Uint8Array(await crypto.subtle.digest('SHA-256', clientData))])
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed))
    return { authenticatorData: base64url(auth), clientDataJSON: base64url(clientData), signature: base64url(rawToDer(raw)) }
  }
  return { publicKey, assert }
}

const exp = (challenge: string, publicKey: JsonWebKey, extra = {}) => ({ challenge, origin: ORIGIN, rpId: RP, publicKey, ...extra })

describe('verifyAssertion', () => {
  it('accepts a valid assertion and returns the new counter', async () => {
    const { publicKey, assert } = await authenticator()
    const c = passkeyChallenge()
    expect(await verifyAssertion(await assert({ challenge: c, count: 5 }), exp(c, publicKey, { signCount: 4 }))).toEqual({ ok: true, signCount: 5 })
  })
  it('rejects each failed check with a reason', async () => {
    const { publicKey, assert } = await authenticator()
    const c = passkeyChallenge()
    const why = async (o: Parameters<typeof assert>[0], extra = {}) => {
      const r = await verifyAssertion(await assert(o), exp(c, publicKey, extra))
      return r.ok ? 'ok' : r.reason
    }
    expect(await why({ challenge: 'other' })).toBe('challenge mismatch')
    expect(await why({ challenge: c, origin: 'https://evil.example' })).toBe('origin mismatch')
    expect(await why({ challenge: c, type: 'webauthn.create' })).toBe('wrong ceremony type')
    expect(await why({ challenge: c, rp: 'evil.example' })).toBe('rpId hash mismatch')
    expect(await why({ challenge: c, flags: 0x04 })).toBe('user presence missing')
    expect(await why({ challenge: c, flags: 0x01 })).toBe('user verification missing')
    expect(await why({ challenge: c, flags: 0x01 }, { requireUserVerification: false })).toBe('ok')
    expect(await why({ challenge: c, count: 3 }, { signCount: 3 })).toMatch(/signCount/)
    expect(await why({ challenge: c, count: 0 }, { signCount: 0 })).toBe('ok')
  })
  it('rejects a signature from another key, tampering, and garbage', async () => {
    const a = await authenticator()
    const b = await authenticator()
    const c = passkeyChallenge()
    const sig = await a.assert({ challenge: c })
    expect((await verifyAssertion(sig, exp(c, b.publicKey))).ok).toBe(false)
    const t = { ...sig, authenticatorData: sig.authenticatorData.replace(/^./, (x) => (x === 'A' ? 'B' : 'A')) }
    expect((await verifyAssertion(t, exp(c, a.publicKey))).ok).toBe(false)
    expect(await verifyAssertion({ authenticatorData: '!!', clientDataJSON: '!!', signature: '!!' }, exp(c, a.publicKey))).toEqual({ ok: false, reason: 'malformed assertion' })
    const short = { ...sig, authenticatorData: 'AAAA' }
    expect(await verifyAssertion(short, exp(c, a.publicKey))).toEqual({ ok: false, reason: 'authenticatorData too short' })
  })
  it('derToRaw handles short and padded integers, rejects junk', () => {
    const raw = derToRaw(Uint8Array.from([0x30, 0x08, 0x02, 0x02, 0x00, 0x81, 0x02, 0x02, 0x01, 0x02]))
    expect(raw[31]).toBe(0x81)
    expect(raw[63]).toBe(0x02)
    expect(() => derToRaw(Uint8Array.from([0x31, 0]))).toThrow()
  })
})

describe('verifyAssertion — cross-origin ceremonies', () => {
  it('rejects a ceremony run in a cross-origin iframe unless the relying party opts in', async () => {
    // A page embedding the RP in an iframe gets `crossOrigin: true` in clientData;
    // an RP that did not plan for that must not accept the assertion.
    const a = await authenticator()
    const c = passkeyChallenge()
    const x = await a.assert({ challenge: c, crossOrigin: true })
    expect(await verifyAssertion(x, exp(c, a.publicKey))).toEqual({ ok: false, reason: 'cross-origin ceremony' })
    expect((await verifyAssertion(x, exp(c, a.publicKey, { allowCrossOrigin: true }))).ok).toBe(true)
    // `crossOrigin: false` is the normal top-level case
    const y = await a.assert({ challenge: c, crossOrigin: false })
    expect((await verifyAssertion(y, exp(c, a.publicKey))).ok).toBe(true)
  })
})
