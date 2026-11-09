/**
 * Real-Chromium smoke for @pyreon/auth.
 *
 * `use-oidc.test.ts` drives the same flow against a hand-built `location` /
 * `history` / `sessionStorage` in Node. That proves the logic, not the platform:
 * here the page is a REAL page, so the things a browser does that a stub cannot
 * are exercised for real — the WebCrypto digest and ECDSA sign/verify, the
 * `sessionStorage` quota/enumeration semantics the flow store relies on, and the
 * `history.replaceState` that scrubs `?code=&state=` from the address bar after
 * the redirect lands.
 *
 * The test page is not navigated away: `redirect` is captured instead of
 * `location.assign`, and the return trip is staged with `history.replaceState`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  base64url,
  codeChallengeS256,
  sessionStorageFlowStore,
  useOidc,
} from '../index'
import type { FetchLike, Jwk } from '../index'

const issuer = 'https://idp.example'
const enc = new TextEncoder()
const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }))

const startUrl = location.href
const redirectUri = `${location.origin}${location.pathname}`

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  sessionStorage.clear()
  history.replaceState(null, '', startUrl)
})

/** An OIDC provider whose id_token is signed with a real P-256 key via WebCrypto. */
async function provider(nonceOverride?: string) {
  const k = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = { ...((await crypto.subtle.exportKey('jwk', k.publicKey)) as Jwk), kid: 'k1', alg: 'ES256' }
  let nonce = ''
  const sign = async (claims: object) => {
    const h = base64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: 'k1' })))
    const p = base64url(enc.encode(JSON.stringify(claims)))
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.privateKey, enc.encode(`${h}.${p}`)))
    return `${h}.${p}.${base64url(sig)}`
  }
  const now = () => Math.floor(Date.now() / 1000)
  const fetchImpl: FetchLike = async (u) => {
    if (u.endsWith('openid-configuration')) {
      return json({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` })
    }
    if (u.endsWith('/jwks')) return json({ keys: [jwk] })
    const id_token = await sign({ iss: issuer, aud: 'app', sub: 'u1', email: 'a@example.com', exp: now() + 300, nonce: nonceOverride ?? nonce })
    return json({ access_token: 'at', token_type: 'Bearer', expires_in: 60, id_token })
  }
  return { fetchImpl, setNonce: (n: string) => (nonce = n) }
}

const settle = async (auth: { status(): string }) => {
  for (let i = 0; i < 200 && auth.status() !== 'signedIn' && auth.status() !== 'error'; i++) {
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('PKCE in real WebCrypto', () => {
  it('matches the RFC 7636 appendix B S256 test vector', async () => {
    expect(await codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})

describe('sessionStorageFlowStore on the real sessionStorage', () => {
  it('round-trips a pending flow once, then it is gone', () => {
    const store = sessionStorageFlowStore()
    const flow = { state: 's1', nonce: 'n', verifier: 'v', redirectUri, createdAt: Date.now() } as never
    store.save(flow)
    expect(sessionStorage.length).toBe(1)
    expect(store.take('s1')).toMatchObject({ state: 's1', verifier: 'v' })
    expect(sessionStorage.length).toBe(0)
    expect(store.take('s1')).toBeNull() // single use: a replayed callback finds nothing
  })
})

describe('useOidc on a real page', () => {
  it('survives the redirect round trip and scrubs the callback from the real URL', async () => {
    const p = await provider()
    const redirects: string[] = []
    const opts = { issuer, clientId: 'app', redirectUri, fetch: p.fetchImpl, redirect: (u: string) => void redirects.push(u) }

    const before = useOidc(opts)
    expect(before.status()).toBe('signedOut')
    await before.signIn()
    const authorize = new URL(redirects[0]!)
    expect(authorize.origin + authorize.pathname).toBe(`${issuer}/auth`)
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    // The challenge on the wire is a real SHA-256 digest of a verifier the page kept.
    expect(authorize.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    p.setNonce(authorize.searchParams.get('nonce')!)
    expect(sessionStorage.length).toBe(1) // only the pending flow survives a page load

    const state = authorize.searchParams.get('state')!
    history.replaceState(null, '', `${location.pathname}?code=c&state=${state}&iss=${encodeURIComponent(issuer)}&keep=1#top`)
    const auth = useOidc(opts)
    // The real address bar is scrubbed synchronously, before the exchange finishes.
    expect(location.search).toBe('?keep=1')
    expect(location.hash).toBe('#top')
    await settle(auth)
    expect(auth.error()).toBeNull()
    expect(auth.status()).toBe('signedIn')
    expect(auth.subject()).toBe('u1')
    expect(auth.claim('email')).toBe('a@example.com')
    expect(auth.accessToken()).toBe('at')
    expect(sessionStorage.length).toBe(0) // the flow was consumed
  })

  it('rejects an id_token whose nonce is not this sign-in, as the cross-target code', async () => {
    const p = await provider('not-this-sign-in')
    const redirects: string[] = []
    const opts = { issuer, clientId: 'app', redirectUri, fetch: p.fetchImpl, redirect: (u: string) => void redirects.push(u) }
    await useOidc(opts).signIn()
    const state = new URL(redirects[0]!).searchParams.get('state')!
    history.replaceState(null, '', `${location.pathname}?code=c&state=${state}`)
    const auth = useOidc(opts)
    await settle(auth)
    expect(auth.status()).toBe('error')
    expect(auth.error()).toBe('bad_nonce')
    expect(auth.accessToken()).toBeNull()
  })

  it('ignores a page that only looks like a callback', async () => {
    const p = await provider()
    history.replaceState(null, '', `${location.pathname}?state=forged`)
    const auth = useOidc({ issuer, clientId: 'app', redirectUri: `${location.origin}/elsewhere`, fetch: p.fetchImpl })
    expect(location.search).toBe('?state=forged') // not this app's redirect: left untouched
    expect(auth.status()).toBe('signedOut')
  })
})
