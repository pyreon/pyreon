import { describe, expect, it } from 'vitest'
import { createAuth, google, keycloak, memoryFlowStore, withPreset } from '../index'
import type { FetchLike } from '../index'

const issuer = 'https://idp.example'
const meta = { issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token` }
const res = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }))

function setup(tokenDelay?: Promise<void>) {
  const redirects: string[] = []
  const f: FetchLike = async (u) => {
    if (u.endsWith('openid-configuration')) return res(meta)
    await tokenDelay
    return res({ access_token: 'at', token_type: 'Bearer' })
  }
  const auth = createAuth({
    issuer,
    client: { clientId: 'app', redirectUri: 'https://app.example/cb' },
    flows: memoryFlowStore(),
    redirect: (u) => redirects.push(u),
    fetch: f,
  })
  return { auth, redirects }
}

const cbFor = (redirect: string) => {
  const state = new URL(redirect).searchParams.get('state')
  return `https://app.example/cb?code=c&state=${state}`
}

describe('createAuth', () => {
  it('signIn redirects, callback signs in', async () => {
    const { auth, redirects } = setup()
    await auth.signIn()
    expect(auth.status()).toBe('signingIn')
    await auth.handleCallback(cbFor(redirects[0]!))
    expect(auth.status()).toBe('signedIn')
    expect(auth.tokens()?.access_token).toBe('at')
  })

  it('a flow is single-use', async () => {
    const { auth, redirects } = setup()
    await auth.signIn()
    const cb = cbFor(redirects[0]!)
    await auth.handleCallback(cb)
    auth.signOut()
    await auth.handleCallback(cb)
    expect(auth.status()).toBe('error')
    expect(auth.error()?.code).toBe('unknown_flow')
  })

  it('a bad state errors without tokens', async () => {
    const { auth } = setup()
    await auth.handleCallback('https://app.example/cb?code=c&state=nope')
    expect(auth.status()).toBe('error')
    expect(auth.tokens()).toBeNull()
  })

  it('a late token exchange cannot resurrect a session after signOut', async () => {
    let release!: () => void
    const { auth, redirects } = setup(new Promise<void>((r) => (release = r)))
    await auth.signIn()
    const pending = auth.handleCallback(cbFor(redirects[0]!))
    await new Promise((r) => setTimeout(r, 5))
    auth.signOut()
    release()
    await pending
    expect(auth.status()).toBe('signedOut')
    expect(auth.tokens()).toBeNull()
  })

  it('discovery failure surfaces as error and retries next time', async () => {
    let n = 0
    const auth = createAuth({
      issuer,
      client: { clientId: 'a', redirectUri: 'https://app.example/cb' },
      flows: memoryFlowStore(),
      redirect: () => {},
      fetch: () => (n++ === 0 ? res({}, 500) : res(meta)),
    })
    await auth.signIn()
    expect(auth.status()).toBe('error')
    await auth.signIn()
    expect(auth.status()).toBe('signingIn')
  })
})

describe('presets', () => {
  it('builds issuers and merges scope', () => {
    expect(google.issuer).toBe('https://accounts.google.com')
    expect(keycloak('https://kc.example/', 'my realm').issuer).toBe('https://kc.example/realms/my%20realm')
    expect(withPreset(google, { clientId: 'x', redirectUri: 'r' }).scope).toBe('openid profile email')
    expect(withPreset(google, { clientId: 'x', redirectUri: 'r', scope: 'openid' }).scope).toBe('openid')
  })
})

describe('memoryFlowStore', () => {
  const flow = (state: string, createdAt: number) => ({
    state,
    nonce: 'n',
    codeVerifier: 'v',
    redirectUri: 'https://app.example/cb',
    issuer: 'https://idp.example',
    createdAt,
  })

  it('drops abandoned flows once they expire, so the store cannot grow without bound', async () => {
    // Every signIn() that is started but never completed (the user closes the tab
    // at the provider) used to stay in the map forever — an unbounded cache.
    const store = memoryFlowStore()
    const t0 = Date.now() - 11 * 60_000 // older than the 10-minute flow lifetime
    for (let i = 0; i < 50; i++) await store.save(flow(`old${i}`, t0))
    await store.save(flow('fresh', Date.now()))
    expect(await store.take('old0')).toBeNull()
    expect(await store.take('old49')).toBeNull()
    expect((await store.take('fresh'))?.state).toBe('fresh')
  })

  it('caps the live entries, evicting the oldest first', async () => {
    const store = memoryFlowStore()
    const now = Date.now()
    for (let i = 0; i < 1100; i++) await store.save(flow(`s${i}`, now))
    expect(await store.take('s0')).toBeNull()
    expect((await store.take('s1099'))?.state).toBe('s1099')
  })
})

describe('createAuth — provider errors', () => {
  it('surfaces a provider error even when the callback carries no state', async () => {
    // e.g. the user cancels at the provider and it redirects back with
    // ?error=access_denied and no state — "no pending authorization" hides why.
    const { auth } = setup()
    await auth.handleCallback('https://app.example/cb?error=access_denied')
    expect(auth.status()).toBe('error')
    expect(auth.error()?.code).toBe('provider_error')
    expect(auth.error()?.message).toContain('access_denied')
  })
})
