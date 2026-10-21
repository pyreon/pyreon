import { describe, expect, it } from 'vitest'
import { base64url, passkeyChallenge, verifyAssertion, verifyRegistration } from '../index'
import { decodeCbor } from '../cbor'

const RP = 'app.example'
const ORIGIN = 'https://app.example'
const te = new TextEncoder()

// tiny CBOR encoder for the test (only what attestation objects need)
const head = (major: number, n: number) => (n < 24 ? [major << 5 | n] : n < 256 ? [major << 5 | 24, n] : [major << 5 | 25, n >> 8, n & 255])
const cText = (s: string) => [...head(3, s.length), ...te.encode(s)]
const cBytes = (b: Uint8Array) => [...head(2, b.length), ...b]
const cInt = (n: number) => (n >= 0 ? head(0, n) : head(1, -1 - n))
const cMap = (pairs: [number[], number[]][]) => [...head(5, pairs.length), ...pairs.flat(2)]

async function register(o: { challenge: string; fmt?: string; flags?: number; type?: string; origin?: string; rp?: string; alg?: number; idLen?: number; crossOrigin?: boolean }) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
  const unb = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
  const cose = cMap([[cInt(1), cInt(2)], [cInt(3), cInt(o.alg ?? -7)], [cInt(-1), cInt(1)], [cInt(-2), cBytes(unb(jwk.x!))], [cInt(-3), cBytes(unb(jwk.y!))]])
  const id = crypto.getRandomValues(new Uint8Array(o.idLen ?? 32))
  const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(o.rp ?? RP)))
  const auth = Uint8Array.from([...rpHash, o.flags ?? 0x45, 0, 0, 0, 7, ...new Uint8Array(16), id.length >> 8, id.length & 255, ...id, ...cose])
  const att = Uint8Array.from(cMap([[cText('fmt'), cText(o.fmt ?? 'none')], [cText('attStmt'), cMap([])], [cText('authData'), cBytes(auth)]]))
  const clientData = te.encode(JSON.stringify({ type: o.type ?? 'webauthn.create', challenge: o.challenge, origin: o.origin ?? ORIGIN, ...(o.crossOrigin === undefined ? {} : { crossOrigin: o.crossOrigin }) }))
  return { input: { attestationObject: base64url(att), clientDataJSON: base64url(clientData) }, jwk, id, kp }
}
const exp = (challenge: string) => ({ challenge, origin: ORIGIN, rpId: RP })

describe('verifyRegistration', () => {
  it('accepts a none-attestation ES256 passkey and extracts a usable key', async () => {
    const c = passkeyChallenge()
    const { input, jwk, id, kp } = await register({ challenge: c })
    const r = await verifyRegistration(input, exp(c))
    expect(r).toMatchObject({ ok: true, signCount: 7, credentialId: base64url(id) })
    if (!r.ok) return
    expect(r.publicKey).toMatchObject({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y })
    // round trip: the extracted key verifies a later assertion
    const cd = te.encode(JSON.stringify({ type: 'webauthn.get', challenge: 'c2', origin: ORIGIN }))
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(RP)))
    const auth = new Uint8Array(37)
    auth.set(rpHash, 0)
    auth[32] = 0x05
    auth[36] = 8
    const signed = new Uint8Array([...auth, ...new Uint8Array(await crypto.subtle.digest('SHA-256', cd))])
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, signed))
    const enc = (v: Uint8Array) => { let x = v; while (x.length > 1 && x[0] === 0) x = x.slice(1); if (x[0]! & 0x80) x = Uint8Array.from([0, ...x]); return [2, x.length, ...x] }
    const body = [...enc(raw.slice(0, 32)), ...enc(raw.slice(32))]
    const sig = base64url(Uint8Array.from([0x30, body.length, ...body]))
    expect(await verifyAssertion({ authenticatorData: base64url(auth), clientDataJSON: base64url(cd), signature: sig }, { challenge: 'c2', origin: ORIGIN, rpId: RP, publicKey: r.publicKey, signCount: r.signCount })).toEqual({ ok: true, signCount: 8 })
  })
  it('rejects each failed check', async () => {
    const c = passkeyChallenge()
    const why = async (o: Parameters<typeof register>[0]) => {
      const r = await verifyRegistration((await register(o)).input, exp(c))
      return r.ok ? 'ok' : r.reason
    }
    expect(await why({ challenge: 'x' })).toBe('challenge mismatch')
    expect(await why({ challenge: c, origin: 'https://evil.example' })).toBe('origin mismatch')
    expect(await why({ challenge: c, type: 'webauthn.get' })).toBe('wrong ceremony type')
    expect(await why({ challenge: c, fmt: 'packed' })).toMatch(/unsupported attestation format "packed"/)
    expect(await why({ challenge: c, rp: 'evil.example' })).toBe('rpId hash mismatch')
    expect(await why({ challenge: c, flags: 0x44 })).toBe('user presence missing')
    expect(await why({ challenge: c, flags: 0x41 })).toBe('user verification missing')
    expect(await why({ challenge: c, flags: 0x05 })).toBe('no attested credential data')
    expect(await why({ challenge: c, alg: -257 })).toMatch(/only ES256/)
    expect(await why({ challenge: c, idLen: 4 })).toBe('bad credential id length')
  })
  it('rejects garbage without throwing', async () => {
    const c = passkeyChallenge()
    for (const g of ['', '!!', 'AAAA']) expect((await verifyRegistration({ attestationObject: g, clientDataJSON: g }, exp(c))).ok).toBe(false)
    const { input } = await register({ challenge: c })
    expect(await verifyRegistration({ ...input, attestationObject: 'AA' }, exp(c))).toEqual({ ok: false, reason: 'malformed attestation' })
  })
})

describe('cbor', () => {
  it('decodes scalars, arrays, nested maps and rejects junk', () => {
    const enc = Uint8Array.from([...cMap([[cText('a'), [0x82, 1, 0x20]], [cText('t'), [0xf5]], [cText('n'), [0xf6]]])])
    const v = decodeCbor(enc).value as Map<string, unknown>
    expect(v.get('a')).toEqual([1, -1])
    expect(v.get('t')).toBe(true)
    expect(v.get('n')).toBeNull()
    expect(decodeCbor(Uint8Array.from([0x18, 200])).value).toBe(200)
    expect(decodeCbor(Uint8Array.from([0xf4])).value).toBe(false)
    expect(() => decodeCbor(Uint8Array.from([0x42, 1]))).toThrow(/truncated/)
    expect(() => decodeCbor(Uint8Array.from([0x1b, 0]))).toThrow(/unsupported/)
    expect(() => decodeCbor(Uint8Array.from([0xf9, 0, 0]))).toThrow(/unsupported/)
    expect(() => decodeCbor(Uint8Array.from(Array(10).fill(0x81)))).toThrow(/deep/)
    expect(() => decodeCbor(Uint8Array.from([0x99, 0xff, 0xff]))).toThrow(/large/)
  })
})

describe('verifyRegistration — cross-origin ceremonies', () => {
  it('rejects a cross-origin registration unless the relying party opts in', async () => {
    const c = 'reg-challenge-xo'
    const r = await register({ challenge: c, crossOrigin: true })
    expect(await verifyRegistration(r.input, exp(c))).toEqual({ ok: false, reason: 'cross-origin ceremony' })
    expect((await verifyRegistration(r.input, { ...exp(c), allowCrossOrigin: true })).ok).toBe(true)
  })
})

describe('RS256 passkeys (Windows Hello)', () => {
  const unb = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
  async function rsaRegister(challenge: string, bits = 2048, padTo = 0) {
    const kp = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )
    const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey)
    // a leading zero on the modulus is legal CBOR-wise and must be tolerated
    const raw = unb(jwk.n!)
    const n = Uint8Array.from([...new Array(Math.max(1, padTo - raw.length)).fill(0), ...raw])
    const cose = cMap([[cInt(1), cInt(3)], [cInt(3), cInt(-257)], [cInt(-1), cBytes(n)], [cInt(-2), cBytes(unb(jwk.e!))]])
    const id = crypto.getRandomValues(new Uint8Array(32))
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(RP)))
    const auth = Uint8Array.from([...rpHash, 0x45, 0, 0, 0, 0, ...new Uint8Array(16), 0, id.length, ...id, ...cose])
    const att = Uint8Array.from(cMap([[cText('fmt'), cText('none')], [cText('attStmt'), cMap([])], [cText('authData'), cBytes(auth)]]))
    const cd = te.encode(JSON.stringify({ type: 'webauthn.create', challenge, origin: ORIGIN }))
    return { input: { attestationObject: base64url(att), clientDataJSON: base64url(cd) }, kp }
  }
  async function rsaAssert(priv: CryptoKey, challenge: string, count: number) {
    const cd = te.encode(JSON.stringify({ type: 'webauthn.get', challenge, origin: ORIGIN }))
    const auth = new Uint8Array(37)
    auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(RP))), 0)
    auth[32] = 0x05
    auth[36] = count
    const signed = new Uint8Array([...auth, ...new Uint8Array(await crypto.subtle.digest('SHA-256', cd))])
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', priv, signed))
    return { authenticatorData: base64url(auth), clientDataJSON: base64url(cd), signature: base64url(sig) }
  }

  it('registers an RSA key and verifies an assertion signed with it', async () => {
    const c = passkeyChallenge()
    const { input, kp } = await rsaRegister(c)
    const r = await verifyRegistration(input, exp(c))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.publicKey).toMatchObject({ kty: 'RSA', alg: 'RS256' })
    const ok = await verifyAssertion(await rsaAssert(kp.privateKey, 'c2', 1), { challenge: 'c2', origin: ORIGIN, rpId: RP, publicKey: r.publicKey })
    expect(ok).toEqual({ ok: true, signCount: 1 })
    // a different RSA key's signature does not verify
    const other = await rsaRegister(c)
    const bad = await verifyAssertion(await rsaAssert(other.kp.privateKey, 'c2', 2), { challenge: 'c2', origin: ORIGIN, rpId: RP, publicKey: r.publicKey })
    expect(bad).toEqual({ ok: false, reason: 'bad signature' })
  })

  it('refuses an RSA key shorter than 2048 bits', async () => {
    const c = passkeyChallenge()
    const r = await verifyRegistration((await rsaRegister(c, 1024)).input, exp(c))
    expect(r).toEqual({ ok: false, reason: 'RSA key shorter than 2048 bits' })
    // zero-padding the modulus to 256 bytes does not make it a 2048-bit key
    const padded = await verifyRegistration((await rsaRegister(c, 1024, 256)).input, exp(c))
    expect(padded).toEqual({ ok: false, reason: 'RSA key shorter than 2048 bits' })
  })

  it('an EC key type cannot be paired with the RS256 algorithm label, nor vice versa', async () => {
    const c = passkeyChallenge()
    const r = await verifyRegistration((await register({ challenge: c, alg: -257 })).input, exp(c))
    expect(r).toEqual({ ok: false, reason: 'only ES256 (P-256) and RS256 passkeys are supported' })
  })

  it('an assertion against an unsupported stored key type fails closed', async () => {
    const auth = new Uint8Array(37)
    auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(RP))), 0)
    auth[32] = 0x05
    auth[36] = 1
    const r = await verifyAssertion(
      { authenticatorData: base64url(auth), clientDataJSON: base64url(te.encode(JSON.stringify({ type: 'webauthn.get', challenge: 'c', origin: ORIGIN }))), signature: 'AA' },
      { challenge: 'c', origin: ORIGIN, rpId: RP, publicKey: { kty: 'oct', k: 'AA' } },
    )
    expect(r).toEqual({ ok: false, reason: 'unsupported public key type' })
  })
})
