/**
 * useOidc — the shared (web + native) sign-in hook, exercised as a browser runs it: a full
 * page load to the provider and back, with only sessionStorage surviving in between.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { base64url, isRedirectFor, sessionStorageFlowStore, useOidc } from '../index'
import type { FetchLike, Jwk, PendingFlow } from '../index'

const issuer = 'https://idp.example'
const enc = new TextEncoder()
const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }))

class MemStorage implements Storage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
}

const g = globalThis as unknown as Record<string, unknown>
const saved = { location: g.location, history: g.history, sessionStorage: g.sessionStorage }
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete g[k]
    else g[k] = v
  }
})

/** A browser page at `href`; `assigned` collects navigations, `replaced` history rewrites. */
function page(href: string, storage: Storage) {
  const nav = { assigned: [] as string[], replaced: [] as string[] }
  g.location = { href, assign: (u: string) => nav.assigned.push(u) }
  g.history = { state: null, replaceState: (_s: unknown, _t: string, u: string) => nav.replaced.push(u) }
  g.sessionStorage = storage
  return nav
}

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

const opts = (fetchImpl: FetchLike) => ({ issuer, clientId: 'app', redirectUri: 'https://app.example/callback', fetch: fetchImpl })

describe('useOidc in a browser', () => {
  it('survives the full-page round trip and scrubs the code from the URL', async () => {
    const storage = new MemStorage()
    const p = await provider()

    // Page 1: sign in → navigate away to the provider.
    const nav1 = page('https://app.example/', storage)
    const before = useOidc(opts(p.fetchImpl))
    expect(before.status()).toBe('signedOut')
    await before.signIn()
    const authorize = new URL(nav1.assigned[0]!)
    expect(authorize.origin + authorize.pathname).toBe(`${issuer}/auth`)
    p.setNonce(authorize.searchParams.get('nonce')!)
    expect(storage.length).toBe(1) // the pending flow, in sessionStorage

    // Page 2: a fresh page load on the redirect URI. Only sessionStorage survived.
    const state = authorize.searchParams.get('state')!
    const nav2 = page(`https://app.example/callback?code=c&state=${state}&iss=${encodeURIComponent(issuer)}&keep=1#top`, storage)
    const auth = useOidc(opts(p.fetchImpl))
    expect(nav2.replaced).toEqual(['/callback?keep=1#top'])
    await new Promise((r) => setTimeout(r, 0))
    for (let i = 0; i < 50 && auth.status() !== 'signedIn' && auth.status() !== 'error'; i++) await new Promise((r) => setTimeout(r, 5))
    expect(auth.error()).toBeNull()
    expect(auth.status()).toBe('signedIn')
    expect(auth.isAuthenticated()).toBe(true)
    expect(auth.subject()).toBe('u1')
    expect(auth.claim('email')).toBe('a@example.com')
    expect(auth.claim('exp')).toBeNull() // string claims only — same as native
    expect(auth.accessToken()).toBe('at')
    expect(auth.expiresAt()).toBeGreaterThan(Date.now())
    expect(storage.length).toBe(0) // the flow was consumed
  })

  it('reports failures as the cross-target error code', async () => {
    const storage = new MemStorage()
    const p = await provider('not-this-sign-in')
    const nav = page('https://app.example/', storage)
    await useOidc(opts(p.fetchImpl)).signIn()
    const state = new URL(nav.assigned[0]!).searchParams.get('state')!
    page(`https://app.example/callback?code=c&state=${state}`, storage)
    const auth = useOidc(opts(p.fetchImpl))
    for (let i = 0; i < 50 && auth.status() !== 'error'; i++) await new Promise((r) => setTimeout(r, 5))
    expect(auth.status()).toBe('error')
    expect(auth.error()).toBe('bad_nonce')
    expect(auth.accessToken()).toBeNull()
  })

  it('does nothing on a page that is not the redirect', async () => {
    const p = await provider()
    const nav = page('https://app.example/other?state=x', new MemStorage())
    const auth = useOidc(opts(p.fetchImpl))
    expect(nav.replaced).toEqual([])
    expect(auth.status()).toBe('signedOut')
  })

  it('outside a browser (SSR) creates a session without touching location', async () => {
    delete g.location
    delete g.history
    const p = await provider()
    expect(useOidc(opts(p.fetchImpl)).status()).toBe('signedOut')
  })
})

describe('sessionStorageFlowStore', () => {
  const flow = (state: string, createdAt: number): PendingFlow => ({
    state,
    nonce: 'n',
    codeVerifier: 'v',
    redirectUri: 'https://app.example/cb',
    issuer,
    createdAt,
  })

  it('is single-use', () => {
    const s = sessionStorageFlowStore(new MemStorage())
    s.save(flow('a', 1000))
    expect(s.take('a')).toMatchObject({ state: 'a' })
    expect(s.take('a')).toBeNull()
  })

  it('sweeps expired flows and caps the rest; leaves foreign keys alone', () => {
    const storage = new MemStorage()
    storage.setItem('app.other', 'x')
    const s = sessionStorageFlowStore(storage)
    for (let i = 0; i < 5; i++) s.save(flow(`old${i}`, 0))
    s.save(flow('fresh', 11 * 60_000))
    expect(storage.length).toBe(2) // the fresh flow + the app's own key
    for (let i = 0; i < 30; i++) s.save(flow(`f${i}`, 11 * 60_000 + i))
    expect(storage.length).toBe(16 + 1)
    expect(storage.getItem('app.other')).toBe('x')
  })

  it('treats a corrupt entry as unknown', () => {
    const storage = new MemStorage()
    storage.setItem('pyreon.auth.flow.bad', '{')
    expect(sessionStorageFlowStore(storage).take('bad')).toBeNull()
    expect(storage.length).toBe(0)
  })
})

describe('isRedirectFor', () => {
  it('matches the redirect page carrying a result, nothing else', () => {
    const r = 'https://app.example/callback'
    expect(isRedirectFor('https://app.example/callback?code=c&state=s', r)).toBe(true)
    expect(isRedirectFor('https://app.example/callback?error=access_denied', r)).toBe(true)
    expect(isRedirectFor('https://app.example/callback', r)).toBe(false)
    expect(isRedirectFor('https://app.example/callbackx?state=s', r)).toBe(false)
    expect(isRedirectFor('https://evil.example/callback?state=s', r)).toBe(false)
    expect(isRedirectFor('not a url', r)).toBe(false)
  })
})
