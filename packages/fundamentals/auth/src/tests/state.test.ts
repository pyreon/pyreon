import { describe, expect, it } from 'vitest'
import { beginAuthorization, createAuth, google, keycloak, memoryFlowStore, parseCallback, withPreset } from '../index'
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
    binding: 'b1',
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
      binding: 'b1',
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
    issuer: 'https://idp.example',
    clientId: 'app',
    redirectUri: 'https://app.example/cb',
    binding: 'b1',
    createdAt,
  })

  it('drops abandoned flows once they expire, so the store cannot grow without bound', async () => {
    // Every signIn() that is started but never completed (the user closes the tab
    // at the provider) used to stay in the map forever — an unbounded cache.
    const store = memoryFlowStore()
    const t0 = Date.now() - 11 * 60_000 // older than the 10-minute flow lifetime
    for (let i = 0; i < 50; i++) await store.save(`old${i}`, flow(`old${i}`, t0))
    await store.save('fresh', flow('fresh', Date.now()))
    expect(await store.take('old0')).toBeNull()
    expect(await store.take('old49')).toBeNull()
    expect((await store.take('fresh'))?.state).toBe('fresh')
  })

  it('caps the live entries, evicting the oldest first', async () => {
    const store = memoryFlowStore()
    const now = Date.now()
    for (let i = 0; i < 1100; i++) await store.save(`s${i}`, flow(`s${i}`, now))
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

// The three probes of the PR #4773 review, as tests.
describe('createAuth — flows are bound to their client, redirect URI and browser', () => {
  const metaFor = (iss: string, token = `${iss}/token`) => ({ issuer: iss, authorization_endpoint: `${iss}/auth`, token_endpoint: token })
  const tokenServer = (posts: { url: string; body: string }[]) => {
    const f: FetchLike = async (u, init) => {
      posts.push({ url: u, body: String(init?.body) })

      return res({ access_token: `at-from-${new URL(u).host}`, token_type: 'Bearer' })
    }

    return f
  }

  it('login CSRF: a callback started in another browser is refused before any token request', async () => {
    // The documented BFF: one shared store, one createAuth per request.
    const flows = memoryFlowStore()
    const posts: { url: string; body: string }[] = []
    const client = { clientId: 'bff', redirectUri: 'https://app.example.com/auth/callback' }
    let location = ''
    const attacker = createAuth({ metadata: metaFor('https://idp.example'), client, flows, binding: 'attacker-browser', redirect: (l) => (location = l), fetch: tokenServer(posts) })
    await attacker.signIn()
    const state = new URL(location).searchParams.get('state')
    // The attacker signs in at the provider as THEMSELVES and sends the callback to the victim.
    const victim = createAuth({ metadata: metaFor('https://idp.example'), client, flows, binding: 'victim-browser', redirect: () => {}, fetch: tokenServer(posts) })
    await victim.handleCallback(`https://app.example.com/auth/callback?code=ATTACKER_CODE&state=${state}`)
    expect(victim.status()).toBe('error')
    expect(victim.error()?.code).toBe('unknown_flow')
    expect(posts).toEqual([])
    // A callback request with no binding cookie at all is refused the same way.
    const noCookie = createAuth({ metadata: metaFor('https://idp.example'), client, flows, binding: null, redirect: () => {}, fetch: tokenServer(posts) })
    await noCookie.handleCallback(`https://app.example.com/auth/callback?code=ATTACKER_CODE&state=${state}`)
    expect(noCookie.error()?.code).toBe('unbound_flow')
    expect(posts).toEqual([])
    // The attacker's own browser can still complete it: the binding is the only difference.
    const attackerBack = createAuth({ metadata: metaFor('https://idp.example'), client, flows, binding: 'attacker-browser', redirect: () => {}, fetch: tokenServer(posts) })
    await attackerBack.handleCallback(`https://app.example.com/auth/callback?code=ATTACKER_CODE&state=${state}`)
    expect(attackerBack.status()).toBe('signedIn')
  })

  it('refuses two providers on one redirect URI over one store (RFC 9700 mix-up), at configuration', () => {
    const flows = memoryFlowStore()
    const client = { clientId: 'app', redirectUri: 'https://app.example/cb' }
    createAuth({ metadata: metaFor('https://github.com'), client, flows, binding: 'b1', redirect: () => {} })
    // The same provider again (another request, a remount) is fine.
    createAuth({ metadata: metaFor('https://github.com'), client, flows, binding: 'b1', redirect: () => {} })
    expect(() => createAuth({ metadata: metaFor('https://attacker.example'), client, flows, binding: 'b1', redirect: () => {} })).toThrow(
      /share the redirect URI https:\/\/app\.example\/cb.*its own redirectUri/,
    )
  })

  it('classic mix-up: the honest provider\'s code (no iss) never reaches a malicious provider\'s token endpoint', async () => {
    const flows = memoryFlowStore()
    const posts: { url: string; body: string }[] = []
    let last = ''
    const mk = (iss: string, redirectUri: string) =>
      createAuth({ metadata: metaFor(iss), client: { clientId: 'app', redirectUri }, flows, binding: 'b1', redirect: (u) => (last = u), fetch: tokenServer(posts) })
    const attacker = mk('https://attacker.example', 'https://app.example/cb/attacker')
    const honest = mk('https://github.com', 'https://app.example/cb/github')
    await attacker.signIn() // the user picks the attacker's (or a compromised) provider
    const state = new URL(last).searchParams.get('state')
    // The attacker bounces the user to the honest provider with the same state; the honest
    // provider redirects to ITS registered redirect URI with its code and no iss.
    const cb = `https://app.example/cb/github?code=HONEST_CODE&state=${state}`
    await honest.handleCallback(cb)
    await attacker.handleCallback(cb)
    expect(posts).toEqual([])
    expect(honest.status()).toBe('error')
    expect(attacker.status()).toBe('error')
  })

  it('parseCallback refuses a callback that did not arrive at the flow\'s redirect URI, a foreign issuer and a foreign binding', async () => {
    const m = metaFor('https://a.example')
    const { flow } = await beginAuthorization(m, { clientId: 'c', redirectUri: 'https://app.example/cb/a' }, 'b1')
    const at = (url: string) => `${url}?code=c&state=${flow.state}`
    expect(() => parseCallback(at('https://other.example/cb/h'), flow, m, 'b1')).toThrow(expect.objectContaining({ code: 'redirect_mismatch' }))
    expect(() => parseCallback(at('https://app.example/cb/h'), flow, m, 'b1')).toThrow(expect.objectContaining({ code: 'redirect_mismatch' }))
    expect(() => parseCallback(at('https://app.example/cb/a'), flow, metaFor('https://b.example'), 'b1')).toThrow(
      expect.objectContaining({ code: 'issuer_mismatch' }),
    )
    expect(() => parseCallback(at('https://app.example/cb/a'), flow, m, 'b2')).toThrow(expect.objectContaining({ code: 'unbound_flow' }))
    expect(parseCallback(at('https://app.example/cb/a'), flow, m, 'b1')).toEqual({ code: 'c' })
  })

  it("concurrent callbacks: another client's instance never consumes the owner's flow", async () => {
    // Two clients at one issuer on one redirect URI, both completing the same callback at once
    // (as two useOidc on a redirect page do). Taking is keyed by the client, so the owner wins
    // whichever runs first.
    for (const ownerFirst of [true, false]) {
      const flows = memoryFlowStore()
      const posts: { url: string; body: string }[] = []
      const redirects: string[] = []
      const mk = (clientId: string) =>
        createAuth({ metadata: metaFor('https://idp.example'), client: { clientId, redirectUri: 'https://app.example/cb' }, flows, binding: 'b1', redirect: (u) => redirects.push(u), fetch: tokenServer(posts) })
      await mk('web').signIn()
      const cb = cbFor(redirects[0]!)
      const owner = mk('web')
      const other = mk('admin')
      await Promise.all((ownerFirst ? [owner, other] : [other, owner]).map((a) => a.handleCallback(cb)))
      expect(owner.status(), `ownerFirst=${ownerFirst}`).toBe('signedIn')
      expect(other.error()?.code).toBe('unknown_flow')
      expect(posts.map((p) => new URLSearchParams(p.body).get('client_id'))).toEqual(['web'])
    }
  })
})

describe('createAuth — refresh', () => {
  it('concurrent refresh() calls share one request, so a rotating refresh token is never reused', async () => {
    const valid = new Set(['rt0'])
    let n = 0
    let familyRevoked = false
    const f: FetchLike = async (_u, init) => {
      const body = new URLSearchParams(String(init?.body))
      if (body.get('grant_type') === 'authorization_code') return res({ access_token: 'at0', token_type: 'Bearer', refresh_token: 'rt0' })
      const rt = body.get('refresh_token')!
      await new Promise((r) => setTimeout(r, 5))
      if (familyRevoked || !valid.has(rt)) {
        familyRevoked = true // reuse detection: the provider revokes the whole family

        return res({ error: 'invalid_grant' }, 400)
      }
      valid.delete(rt)
      const next = `rt${++n}`
      valid.add(next)

      return res({ access_token: `at${n}`, token_type: 'Bearer', refresh_token: next })
    }
    const redirects: string[] = []
    const auth = createAuth({ metadata: meta, client: { clientId: 'app', redirectUri: 'https://app.example/cb' }, flows: memoryFlowStore(), binding: 'b1', redirect: (u) => redirects.push(u), fetch: f })
    await auth.signIn()
    await auth.handleCallback(cbFor(redirects[0]!))
    await Promise.all([auth.refresh(), auth.refresh(), auth.refresh()])
    expect(familyRevoked).toBe(false)
    expect(auth.status()).toBe('signedIn')
    expect(auth.tokens()?.refresh_token).toBe('rt1')
    await auth.refresh() // a later refresh is a new request
    expect(auth.tokens()?.refresh_token).toBe('rt2')
  })
})
