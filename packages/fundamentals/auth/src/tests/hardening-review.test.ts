// Fixes from the PR #4773 security review: return-to paths, DER signatures, ID-token claims and
// keys, TOTP parameters, cookie attributes, the flow binding cookie, and the export surface.
import { afterEach, describe, expect, it } from 'vitest'
import * as api from '../index'
import { createFlowBinding, createJwksCache, readFlowBinding, safeReturnTo, sessionCookie, totp, verifyIdToken, verifyTotp } from '../index'
import type { FetchLike, Jwk, OidcMetadata } from '../index'
import manifest from '../manifest'
import { derToRaw } from '../passkey'
import { base64url } from '../pkce'
import { _resetRedirectClaims } from '../redirects'

// Redirect-URI claims are process-wide (see redirects.ts); each test starts with none.
afterEach(() => _resetRedirectClaims())

describe('safeReturnTo — resolved and decoded paths', () => {
  it('refuses paths that resolve, or decode, to a protocol-relative //host', () => {
    for (const v of ['/a/../..//evil.example', '/.//evil.example', '/%2F%2Fevil.example', '/%2f/evil.example', '/%5Cevil.example', '/%252F%252Fevil.example', '/%2e%2e/%2f/evil', '/%zz']) {
      expect(safeReturnTo(v), v).toBe('/')
    }
  })
  it('keeps ordinary paths, normalising dot segments', () => {
    expect(safeReturnTo('/a/b?x=1#h')).toBe('/a/b?x=1#h')
    expect(safeReturnTo('/a/./b/../c')).toBe('/a/c')
    expect(safeReturnTo('/caf%C3%A9')).toBe('/caf%C3%A9')
  })
})

describe('derToRaw — strict DER only', () => {
  const r = new Uint8Array(32).fill(1)
  const s = new Uint8Array(32).fill(2)
  const canonical = new Uint8Array([0x30, 68, 0x02, 32, ...r, 0x02, 32, ...s])
  it('accepts the canonical encoding, including a sign-padding zero', () => {
    expect(derToRaw(canonical).length).toBe(64)
    const high = new Uint8Array(32).fill(0x81)
    const padded = new Uint8Array([0x30, 69, 0x02, 33, 0, ...high, 0x02, 32, ...s])
    expect(derToRaw(padded).slice(0, 32)).toEqual(high)
  })
  it('refuses every other spelling', () => {
    const bad: [string, number[]][] = [
      ['wrong outer length', [0x30, 5, 0x02, 32, ...r, 0x02, 32, ...s]],
      ['trailing bytes', [0x30, 68, 0x02, 32, ...r, 0x02, 32, ...s, 0xde, 0xad]],
      ['zero-length r', [0x30, 36, 0x02, 0, 0x02, 32, ...s]],
      ['truncated s', [0x30, 68, 0x02, 32, ...r, 0x02, 32, ...s.slice(0, 10)]],
      ['extra leading zeros', [0x30, 70, 0x02, 34, 0, 0, ...r, 0x02, 32, ...s]],
      ['unneeded zero before a low byte', [0x30, 69, 0x02, 33, 0, ...r, 0x02, 32, ...s]],
      ['negative r', [0x30, 68, 0x02, 32, 0x80, ...r.slice(1), 0x02, 32, ...s]],
      ['r = 0', [0x30, 39, 0x02, 1, 0, 0x02, 32, ...s]],
      ['long-form outer length', [0x30, 0x81, 68, 0x02, 32, ...r, 0x02, 32, ...s]],
    ]
    for (const [name, bytes] of bad) expect(() => derToRaw(new Uint8Array(bytes)), name).toThrow(/bad DER/)
  })
})

describe('verifyIdToken — azp, iat, key_ops, key size, kid-less rotation', () => {
  const enc = new TextEncoder()
  const b = (o: unknown) => base64url(enc.encode(JSON.stringify(o)))
  const meta: OidcMetadata = { issuer: 'https://idp.example', authorization_endpoint: 'https://idp.example/a', token_endpoint: 'https://idp.example/t', jwks_uri: 'https://idp.example/jwks' }
  const now = Math.floor(Date.now() / 1000)
  const base = { iss: meta.issuer, sub: 'u1', aud: 'client', exp: now + 300, iat: now, nonce: 'n' }
  const opts = { clientId: 'client', nonce: 'n' }
  const rsaPair = (bits: number) =>
    crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>
  const pub = async (k: CryptoKeyPair, kid?: string): Promise<Jwk> => {
    const { kty, n, e } = (await crypto.subtle.exportKey('jwk', k.publicKey)) as JsonWebKey
    return { kty, n, e, ...(kid ? { kid } : {}) } as Jwk
  }
  const sign = async (k: CryptoKeyPair, header: object, claims: object) => {
    const input = `${b(header)}.${b(claims)}`
    return `${input}.${base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', k.privateKey, enc.encode(input))))}`
  }
  const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code)

  it('enforces azp when present, even with a single audience', async () => {
    const k = await rsaPair(2048)
    const keys = [await pub(k, 'k')]
    expect(await code(verifyIdToken(await sign(k, { alg: 'RS256', kid: 'k' }, { ...base, azp: 'evil-client' }), keys, meta, opts))).toBe('bad_azp')
    expect(await code(verifyIdToken(await sign(k, { alg: 'RS256', kid: 'k' }, { ...base, azp: 'client' }), keys, meta, opts))).toBe('ok')
  })

  it('refuses a token issued in the future, and one older than maxAge', async () => {
    const k = await rsaPair(2048)
    const keys = [await pub(k, 'k')]
    const h = { alg: 'RS256', kid: 'k' }
    expect(await code(verifyIdToken(await sign(k, h, { ...base, iat: now + 3600 }), keys, meta, opts))).toBe('not_yet_valid')
    const old = await sign(k, h, { ...base, iat: now - 3600 })
    expect(await code(verifyIdToken(old, keys, meta, opts))).toBe('ok')
    expect(await code(verifyIdToken(old, keys, meta, { ...opts, maxAge: 600 }))).toBe('too_old')
    expect(await code(verifyIdToken(await sign(k, h, { ...base, iat: undefined }), keys, meta, { ...opts, maxAge: 600 }))).toBe('too_old')
  })

  it('honours key_ops and refuses RSA keys under 2048 bits', async () => {
    const k = await rsaPair(2048)
    const h = { alg: 'RS256', kid: 'k' }
    const t = await sign(k, h, base)
    expect(await code(verifyIdToken(t, [{ ...(await pub(k, 'k')), key_ops: ['encrypt'] }], meta, opts))).toBe('no_key')
    expect(await code(verifyIdToken(t, [{ ...(await pub(k, 'k')), key_ops: ['verify'] }], meta, opts))).toBe('ok')
    const weak = await rsaPair(1024)
    expect(await code(verifyIdToken(await sign(weak, h, base), [await pub(weak, 'k')], meta, opts))).toBe('no_key')
  })

  it('re-fetches the key set once when a token without kid fails against cached keys (rotation)', async () => {
    const before = await rsaPair(2048)
    const after = await rsaPair(2048)
    let published = [await pub(before)]
    let fetches = 0
    const f: FetchLike = async () => {
      fetches++

      return new Response(JSON.stringify({ keys: published }))
    }
    let t = 0
    const jwks = createJwksCache(meta, f, { now: () => t })
    expect(await code(verifyIdToken(await sign(before, { alg: 'RS256' }, base), jwks, meta, opts))).toBe('ok')
    published = [await pub(after)] // the provider rotated
    t = 2 * 60_000 // past the re-fetch throttle, within maxAge
    expect(await code(verifyIdToken(await sign(after, { alg: 'RS256' }, base), jwks, meta, opts))).toBe('ok')
    expect(fetches).toBe(2)
    // Within the throttle, a forged kid-less token costs no request.
    expect(await code(verifyIdToken(await sign(await rsaPair(2048), { alg: 'RS256' }, base), jwks, meta, opts))).toBe('bad_signature')
    expect(fetches).toBe(2)
  })
})

describe('TOTP options', () => {
  const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' // 160 bits
  it('verifyTotp takes the same period and digits as totp()', async () => {
    const now = 1_700_000_000_000
    const code = await totp(SECRET, { now, period: 60, digits: 8 })
    expect(code).toMatch(/^\d{8}$/)
    expect(await verifyTotp(SECRET, code, { now, period: 60, digits: 8 })).toMatchObject({ ok: true })
    expect(await verifyTotp(SECRET, code, { now })).toEqual({ ok: false })
  })
  it('throws on an empty secret instead of reporting a wrong code', async () => {
    await expect(verifyTotp('', '123456')).rejects.toThrow(/secret is empty/)
    await expect(totp('')).rejects.toThrow(/secret is empty/)
    await expect(totp(SECRET, { digits: 4 })).rejects.toThrow(/digits/)
  })
})

describe('sessionCookie and the flow binding cookie', () => {
  it('refuses names and values that would inject cookie attributes', () => {
    expect(() => sessionCookie('sid; Domain=evil.example', 'v')).toThrow(/invalid cookie name/)
    expect(() => sessionCookie('sid', 'v; Domain=evil.example')).toThrow(/invalid cookie value/)
    expect(() => sessionCookie('sid', 'v', -1)).toThrow(/maxAge/)
    expect(sessionCookie('sid', 'abc.DEF-_')).toBe('__Host-sid=abc.DEF-_; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800')
  })
  it('creates a host-only binding cookie, reuses it, and reads it back', () => {
    const first = createFlowBinding()
    expect(first.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(first.setCookie).toBe(`__Host-pyreon-auth-binding=${first.value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`)
    const header = `a=1; __Host-pyreon-auth-binding=${first.value}; b=2`
    expect(createFlowBinding(header).value).toBe(first.value)
    expect(readFlowBinding(header)).toBe(first.value)
    expect(readFlowBinding('a=1')).toBeNull()
    expect(readFlowBinding('__Host-pyreon-auth-binding=short')).toBeNull()
    expect(createFlowBinding('__Host-pyreon-auth-binding=short').value).not.toBe('short')
  })
})

describe('export surface', () => {
  it('publishes exactly the documented API', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'AuthError', 'beginAuthorization', 'codeChallengeS256', 'createAttemptLimiter', 'createAuth', 'createFlowBinding', 'createGuard',
        'createJwksCache', 'discover', 'endSessionUrl', 'exchangeCode', 'facebook', 'generateCodeVerifier', 'generateTotpSecret', 'github',
        'google', 'keycloak', 'memoryFlowStore', 'oauth2', 'parseCallback', 'passkeyChallenge', 'readFlowBinding', 'refreshTokens',
        'safeReturnTo', 'sessionCookie', 'sessionStorageFlowStore', 'signSession', 'totp', 'useOidc', 'verifyAssertion', 'verifyIdToken',
        'verifyRegistration', 'verifySession', 'verifyTotp', 'withPreset',
      ].sort(),
    )
  })
  it('documents every runtime export in the manifest (what MCP get_api and the reference page read)', () => {
    const documented = new Set<string>(manifest.api.map((e) => e.name))
    expect(Object.keys(api).filter((n) => !documented.has(n))).toEqual([])
  })
})
