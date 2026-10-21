import { describe, expect, it } from 'vitest'
import { fetchJwks, verifyIdToken } from '../index'
import type { OidcMetadata } from '../index'

const meta: OidcMetadata = { issuer: 'https://idp.example', authorization_endpoint: 'https://idp.example/a', token_endpoint: 'https://idp.example/t', jwks_uri: 'https://idp.example/jwks' }
const b64 = (b: ArrayBuffer | Uint8Array | string) => {
  const u = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b)
  let s = ''
  for (const c of u) s += String.fromCharCode(c)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
const NOW = 1_700_000_000_000

async function rsa() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }
  const sign = async (claims: object, header: object = { alg: 'RS256', kid: 'k1' }) => {
    const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claims))}`
    return `${input}.${b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(input)))}`
  }
  return { jwk, sign }
}
const good = { iss: meta.issuer, sub: 'u1', aud: 'app', exp: NOW / 1000 + 600, nonce: 'n1' }
const opts = { clientId: 'app', nonce: 'n1', now: NOW }
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e as { code: string }).code)

describe('verifyIdToken', () => {
  it('accepts a valid RS256 token', async () => {
    const { jwk, sign } = await rsa()
    expect((await verifyIdToken(await sign(good), [jwk], meta, opts)).sub).toBe('u1')
  })
  it('accepts ES256', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'e1' }
    const input = `${b64(JSON.stringify({ alg: 'ES256', kid: 'e1' }))}.${b64(JSON.stringify(good))}`
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(input))
    expect((await verifyIdToken(`${input}.${b64(sig)}`, [jwk], meta, opts)).sub).toBe('u1')
  })
  it('rejects alg none / HS256 / unknown alg (no alg confusion)', async () => {
    const { jwk } = await rsa()
    for (const alg of ['none', 'HS256', 'PS256']) {
      const t = `${b64(JSON.stringify({ alg }))}.${b64(JSON.stringify(good))}.${b64('x')}`
      expect(await code(verifyIdToken(t, [jwk], meta, opts))).toBe('bad_alg')
    }
  })
  it('rejects tampered payload and a different key', async () => {
    const a = await rsa()
    const b = await rsa()
    const t = await a.sign(good)
    const [h, , s] = t.split('.')
    expect(await code(verifyIdToken(`${h}.${b64(JSON.stringify({ ...good, sub: 'admin' }))}.${s}`, [a.jwk], meta, opts))).toBe('bad_signature')
    expect(await code(verifyIdToken(t, [b.jwk], meta, opts))).toBe('bad_signature')
  })
  it('checks iss, aud, azp, exp (with skew), nonce, sub', async () => {
    const { jwk, sign } = await rsa()
    const v = async (c: object, o = opts) => code(verifyIdToken(await sign(c), [jwk], meta, o))
    expect(await v({ ...good, iss: 'https://evil.example' })).toBe('bad_iss')
    expect(await v({ ...good, aud: 'other' })).toBe('bad_aud')
    expect(await v({ ...good, aud: ['app', 'x'] })).toBe('bad_azp')
    expect(await v({ ...good, aud: ['app', 'x'], azp: 'app' })).toBe('ok')
    expect(await v({ ...good, exp: NOW / 1000 - 30 })).toBe('ok')
    expect(await v({ ...good, exp: NOW / 1000 - 61 })).toBe('expired')
    expect(await v({ ...good, nonce: 'zzz' })).toBe('bad_nonce')
    expect(await v({ ...good, sub: '' })).toBe('bad_token')
  })
  it('rejects malformed input and missing keys', async () => {
    const { jwk, sign } = await rsa()
    expect(await code(verifyIdToken('a.b', [jwk], meta, opts))).toBe('bad_token')
    expect(await code(verifyIdToken('!!.!!.!!', [jwk], meta, opts))).toBe('bad_token')
    expect(await code(verifyIdToken(await sign(good, { alg: 'RS256', kid: 'nope' }), [jwk], meta, opts))).toBe('no_key')
  })
})

describe('fetchJwks', () => {
  it('fetches keys, requires https jwks_uri', async () => {
    const keys = await fetchJwks(meta, () => Promise.resolve(new Response(JSON.stringify({ keys: [{ kty: 'RSA' }] }))))
    expect(keys).toHaveLength(1)
    expect(await code(fetchJwks({ issuer: meta.issuer, authorization_endpoint: meta.authorization_endpoint, token_endpoint: meta.token_endpoint }))).toBe('no_jwks')
    expect(await code(fetchJwks({ ...meta, jwks_uri: 'http://x/jwks' }))).toBe('insecure_url')
    expect(await code(fetchJwks(meta, () => Promise.resolve(new Response('', { status: 500 }))))).toBe('jwks_failed')
  })
})

describe('verifyIdToken — hardening', () => {
  it('rejects a token that is not yet valid (nbf in the future)', async () => {
    const { jwk, sign } = await rsa()
    expect(await code(verifyIdToken(await sign({ ...good, nbf: NOW / 1000 + 600 }), [jwk], meta, opts))).toBe('not_yet_valid')
    // within the clock-skew allowance is fine
    expect(await code(verifyIdToken(await sign({ ...good, nbf: NOW / 1000 + 30 }), [jwk], meta, opts))).toBe('ok')
  })
  it('rejects a token carrying critical header extensions it does not understand (RFC 7515 §4.1.11)', async () => {
    const { jwk, sign } = await rsa()
    const t = await sign(good, { alg: 'RS256', kid: 'k1', crit: ['exp'], exp: 1 })
    expect(await code(verifyIdToken(t, [jwk], meta, opts))).toBe('bad_token')
  })
  it('fails with an AuthError on malformed payloads, signatures and key sets', async () => {
    const { jwk, sign } = await rsa()
    const valid = await sign(good)
    // correctly SIGNED payloads that are valid JSON but not a claims object
    expect(await code(verifyIdToken(await sign(null as never), [jwk], meta, opts))).toBe('bad_token')
    expect(await code(verifyIdToken(await sign([1]), [jwk], meta, opts))).toBe('bad_token')
    // signature segment that is not base64url
    const [h2, p2] = valid.split('.')
    expect(await code(verifyIdToken(`${h2}.${p2}.%%%`, [jwk], meta, opts))).toBe('bad_signature')
    // a key that cannot be imported
    expect(await code(verifyIdToken(valid, [{ ...jwk, n: 'not-a-modulus!!' }], meta, opts))).toBe('bad_signature')
  })
  it('fetchJwks rejects a document without a keys array', async () => {
    const f = () => Promise.resolve(new Response(JSON.stringify({ nokeys: true })))
    expect(await code(fetchJwks(meta, f))).toBe('jwks_failed')
  })
})
