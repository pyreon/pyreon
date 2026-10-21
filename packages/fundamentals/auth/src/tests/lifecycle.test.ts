/**
 * Session lifecycle after sign-in: the JWKS cache (key rotation), token refresh,
 * provider logout, session revocation and the attempt limiter. Real ES256 keys.
 */
import { describe, expect, it } from 'vitest'
import {
  base64url,
  createAttemptLimiter,
  createAuth,
  createJwksCache,
  endSessionUrl,
  memoryFlowStore,
  refreshTokens,
  signSession,
  tokenKid,
  verifySession,
} from '../index'
import type { FetchLike, Jwk, OidcMetadata } from '../index'

const issuer = 'https://idp.example'
const enc = new TextEncoder()
const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }))
const meta: OidcMetadata = {
  issuer,
  authorization_endpoint: `${issuer}/auth`,
  token_endpoint: `${issuer}/token`,
  jwks_uri: `${issuer}/jwks`,
  end_session_endpoint: `${issuer}/logout`,
}

async function keypair(kid: string): Promise<{ priv: CryptoKey; jwk: Jwk }> {
  const k = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', k.publicKey)) as Jwk
  return { priv: k.privateKey, jwk: { ...jwk, kid, alg: 'ES256', use: 'sig' } }
}

async function sign(kp: { priv: CryptoKey; jwk: Jwk }, claims: Record<string, unknown>): Promise<string> {
  const h = base64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: kp.jwk.kid, typ: 'JWT' })))
  const p = base64url(enc.encode(JSON.stringify(claims)))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.priv, enc.encode(`${h}.${p}`)))
  return `${h}.${p}.${base64url(sig)}`
}

const nowS = () => Math.floor(Date.now() / 1000)
const claims = (sub: string, nonce?: string) => ({
  iss: issuer,
  sub,
  aud: 'app',
  exp: nowS() + 300,
  iat: nowS(),
  ...(nonce ? { nonce } : {}),
})

describe('createJwksCache', () => {
  const k = (kid: string) => ({ kty: 'EC', kid }) as Jwk
  function provider() {
    let set = [k('a')]
    let calls = 0
    const f: FetchLike = () => {
      calls++
      return json({ keys: set })
    }
    return { f, rotate: (kids: string[]) => (set = kids.map(k)), calls: () => calls }
  }

  it('fetches once and serves the cached set', async () => {
    const p = provider()
    const c = createJwksCache(meta, p.f)
    await c.keys('a')
    await c.keys('a')
    await c.keys()
    expect(p.calls()).toBe(1)
  })

  it('concurrent callers share one in-flight fetch', async () => {
    const p = provider()
    const c = createJwksCache(meta, p.f)
    await Promise.all([c.keys(), c.keys(), c.keys()])
    expect(p.calls()).toBe(1)
  })

  it('re-fetches on an unknown kid (rotation), but no more often than minRefresh', async () => {
    const p = provider()
    let t = 0
    const c = createJwksCache(meta, p.f, { now: () => t, minRefreshMs: 1000 })
    await c.keys('a')
    p.rotate(['a', 'b'])
    // too soon: an attacker spraying random kids must not force a fetch per token
    expect((await c.keys('b')).map((x) => x.kid)).toEqual(['a'])
    expect(p.calls()).toBe(1)
    t = 1000
    expect((await c.keys('b')).map((x) => x.kid)).toEqual(['a', 'b'])
    expect(p.calls()).toBe(2)
  })

  it('re-fetches after maxAge', async () => {
    const p = provider()
    let t = 0
    const c = createJwksCache(meta, p.f, { now: () => t, maxAgeMs: 5000 })
    await c.keys()
    t = 5001
    await c.keys()
    expect(p.calls()).toBe(2)
  })

  it('does not cache a failure', async () => {
    let fail = true
    const f: FetchLike = () => (fail ? json({}, 500) : json({ keys: [k('a')] }))
    const c = createJwksCache(meta, f)
    await expect(c.keys()).rejects.toMatchObject({ code: 'jwks_failed' })
    fail = false
    expect(await c.keys()).toHaveLength(1)
  })

  it('tokenKid reads the header kid and tolerates garbage', async () => {
    const kp = await keypair('k9')
    expect(tokenKid(await sign(kp, claims('u')))).toBe('k9')
    for (const g of ['', 'x', 'a.b.c', '%%%.x.y']) expect(tokenKid(g)).toBeUndefined()
  })
})

describe('refreshTokens / endSessionUrl', () => {
  it('posts a refresh_token grant with the client id and no secret', async () => {
    let body = ''
    const t = await refreshTokens(meta, { clientId: 'app', redirectUri: 'https://app.example/cb' }, 'rt1', (_u, init) => {
      body = String(init?.body)
      return json({ access_token: 'at2', token_type: 'Bearer' })
    })
    expect(t.access_token).toBe('at2')
    const p = new URLSearchParams(body)
    expect(p.get('grant_type')).toBe('refresh_token')
    expect(p.get('refresh_token')).toBe('rt1')
    expect(p.get('client_id')).toBe('app')
    expect(p.has('client_secret')).toBe(false)
  })

  it('builds the RP-initiated logout URL, or null when unsupported', () => {
    const u = new URL(endSessionUrl(meta, { idTokenHint: 'idt', clientId: 'app', postLogoutRedirectUri: 'https://app.example/' })!)
    expect(u.origin + u.pathname).toBe(`${issuer}/logout`)
    expect(u.searchParams.get('id_token_hint')).toBe('idt')
    expect(u.searchParams.get('client_id')).toBe('app')
    expect(u.searchParams.get('post_logout_redirect_uri')).toBe('https://app.example/')
    const { end_session_endpoint: _drop, ...noLogout } = meta
    expect(endSessionUrl(noLogout)).toBeNull()
    expect(() => endSessionUrl({ ...meta, end_session_endpoint: 'http://idp.example/logout' })).toThrow(/https/)
  })
})

/** A fake provider that can sign in, refresh and rotate its signing key. */
async function provider(
  opts: { refreshSub?: string; refreshRotates?: boolean; refreshStatus?: number; noRefreshToken?: boolean; minRefreshMs?: number } = {},
) {
  let kp = await keypair('k1')
  let nonce = ''
  let refreshes = 0
  let jwksCalls = 0
  const f: FetchLike = async (u, init) => {
    if (u.endsWith('openid-configuration')) return json(meta)
    if (u.endsWith('/jwks')) {
      jwksCalls++
      return json({ keys: [kp.jwk] })
    }
    const p = new URLSearchParams(String(init?.body))
    if (p.get('grant_type') === 'refresh_token') {
      refreshes++
      if (opts.refreshStatus) return json({ error: 'invalid_grant' }, opts.refreshStatus)
      return json({
        access_token: `at-r${refreshes}`,
        token_type: 'Bearer',
        expires_in: 60,
        id_token: await sign(kp, claims(opts.refreshSub ?? 'u1')),
        ...(opts.refreshRotates ? { refresh_token: `rt-r${refreshes}` } : {}),
      })
    }
    return json({
      access_token: 'at0',
      token_type: 'Bearer',
      expires_in: 120,
      id_token: await sign(kp, claims('u1', nonce)),
      ...(opts.noRefreshToken ? {} : { refresh_token: 'rt0' }),
    })
  }
  const redirects: string[] = []
  const auth = createAuth({
    issuer,
    client: { clientId: 'app', redirectUri: 'https://app.example/cb' },
    flows: memoryFlowStore(),
    redirect: (u) => redirects.push(u),
    fetch: f,
    ...(opts.minRefreshMs === undefined ? {} : { jwks: { minRefreshMs: opts.minRefreshMs } }),
  })
  await auth.signIn()
  const a = new URL(redirects[0]!)
  nonce = a.searchParams.get('nonce')!
  const before = Date.now()
  await auth.handleCallback(`https://app.example/cb?code=c&state=${a.searchParams.get('state')}`)
  return {
    auth,
    redirects,
    before,
    rotateKey: async () => (kp = await keypair('k2')),
    jwksCalls: () => jwksCalls,
  }
}

describe('createAuth — after sign-in', () => {
  it('exposes expiresAt from expires_in', async () => {
    const { auth, before } = await provider()
    expect(auth.status()).toBe('signedIn')
    expect(auth.expiresAt()).toBeGreaterThanOrEqual(before + 120_000)
    expect(auth.expiresAt()).toBeLessThanOrEqual(Date.now() + 120_000)
  })

  it('refresh() swaps in new tokens, keeping the refresh token when not rotated', async () => {
    const { auth } = await provider()
    await auth.refresh()
    expect(auth.status()).toBe('signedIn')
    expect(auth.tokens()?.access_token).toBe('at-r1')
    expect(auth.tokens()?.refresh_token).toBe('rt0')
    expect(auth.claims()?.sub).toBe('u1')
    expect(auth.expiresAt()).toBeLessThanOrEqual(Date.now() + 60_000)
  })

  it('refresh() adopts a rotated refresh token', async () => {
    const { auth } = await provider({ refreshRotates: true })
    await auth.refresh()
    expect(auth.tokens()?.refresh_token).toBe('rt-r1')
    await auth.refresh()
    expect(auth.tokens()?.refresh_token).toBe('rt-r2')
  })

  it('refresh() refuses an ID token for a different user', async () => {
    const { auth } = await provider({ refreshSub: 'mallory' })
    await auth.refresh()
    expect(auth.status()).toBe('error')
    expect(auth.error()?.code).toBe('subject_changed')
    expect(auth.tokens()).toBeNull()
    expect(auth.claims()).toBeNull()
  })

  it('refresh() without a refresh token, or refused by the provider, clears the session', async () => {
    const a = await provider({ noRefreshToken: true })
    await a.auth.refresh()
    expect(a.auth.error()?.code).toBe('no_refresh_token')
    expect(a.auth.tokens()).toBeNull()

    const b = await provider({ refreshStatus: 400 })
    await b.auth.refresh()
    expect(b.auth.error()?.code).toBe('token_exchange_failed')
    expect(b.auth.status()).toBe('error')
  })

  it('an unknown kid within the re-fetch throttle fails closed without another JWKS request', async () => {
    const p = await provider()
    expect(p.jwksCalls()).toBe(1)
    await p.rotateKey()
    await p.auth.refresh()
    expect(p.auth.error()?.code).toBe('no_key')
    expect(p.jwksCalls()).toBe(1)
  })

  it('verifies a token signed by a rotated key after one JWKS re-fetch', async () => {
    const p = await provider({ minRefreshMs: 0 })
    await p.rotateKey()
    await p.auth.refresh()
    expect(p.auth.status()).toBe('signedIn')
    expect(p.jwksCalls()).toBe(2)
  })

  it('signOut({ endProviderSession }) redirects to the provider with id_token_hint', async () => {
    const { auth, redirects } = await provider()
    const idToken = auth.tokens()!.id_token!
    auth.signOut({ endProviderSession: true, postLogoutRedirectUri: 'https://app.example/' })
    expect(auth.status()).toBe('signedOut')
    expect(auth.tokens()).toBeNull()
    const u = new URL(redirects.at(-1)!)
    expect(u.pathname).toBe('/logout')
    expect(u.searchParams.get('id_token_hint')).toBe(idToken)
    expect(u.searchParams.get('post_logout_redirect_uri')).toBe('https://app.example/')
  })

  it('plain signOut() stays local', async () => {
    const { auth, redirects } = await provider()
    const n = redirects.length
    auth.signOut()
    expect(auth.status()).toBe('signedOut')
    expect(redirects).toHaveLength(n)
  })
})

describe('session revocation', () => {
  const S = 's'.repeat(32)
  it('isRevoked rejects a revoked jti; every signed session carries one', async () => {
    const revoked = new Set<string>()
    const opts = { secrets: [S], isRevoked: (jti: string) => revoked.has(jti) }
    const v = await signSession({ sub: 'u1' }, { secrets: [S] })
    const p = await verifySession(v, opts)
    expect(typeof p?.jti).toBe('string')
    revoked.add(p!.jti as string)
    expect(await verifySession(v, opts)).toBeNull()
    // without the hook, the same cookie still verifies
    expect((await verifySession(v, { secrets: [S] }))?.sub).toBe('u1')
  })
  it('accepts an async revocation check', async () => {
    const v = await signSession({ sub: 'u1' }, { secrets: [S] })
    expect(await verifySession(v, { secrets: [S], isRevoked: async () => true })).toBeNull()
  })
})

describe('createAttemptLimiter', () => {
  it('allows max attempts per window, then reports when to retry', () => {
    let t = 0
    const l = createAttemptLimiter({ max: 3, windowMs: 1000, now: () => t })
    expect(l.attempt('u')).toEqual({ allowed: true, remaining: 2 })
    l.attempt('u')
    expect(l.attempt('u')).toEqual({ allowed: true, remaining: 0 })
    t = 400
    expect(l.attempt('u')).toEqual({ allowed: false, retryAfterMs: 600 })
    expect(l.attempt('other').allowed).toBe(true)
    t = 1000
    expect(l.attempt('u').allowed).toBe(true)
  })
  it('reset() clears a key after success', () => {
    const l = createAttemptLimiter({ max: 1 })
    l.attempt('u')
    expect(l.attempt('u').allowed).toBe(false)
    l.reset('u')
    expect(l.attempt('u').allowed).toBe(true)
  })
  it('never tracks more than maxKeys', () => {
    const l = createAttemptLimiter({ max: 1, maxKeys: 10 })
    for (let i = 0; i < 1000; i++) l.attempt(`k${i}`)
    // the oldest keys were evicted, so the earliest attacker key is fresh again,
    // while the newest is still throttled
    expect(l.attempt('k999').allowed).toBe(false)
    expect(l.attempt('k0').allowed).toBe(true)
  })
})
