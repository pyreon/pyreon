// Fixes from the second security review of PR #4773 (rv-4773/probe-r2.ts, as tests).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { beginAuthorization, createAuth, memoryFlowStore, parseCallback, safeReturnTo, totp, verifyTotp } from '../index'
import type { FetchLike, FlowStore, OidcMetadata, PendingFlow } from '../index'
import { redirectTarget } from '../oidc'
import { _resetRedirectClaims } from '../redirects'

afterEach(() => _resetRedirectClaims())

const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }))

const metaFor = (iss: string, extra: Partial<OidcMetadata> = {}): OidcMetadata => ({
  issuer: iss,
  authorization_endpoint: `${iss}/authorize`,
  token_endpoint: `${iss}/token`,
  ...extra,
})

const B = 'b'.repeat(43)

describe('one redirect URI per provider — process-wide, whatever the flow store', () => {
  it('refuses two providers on one URI with separate store objects, and per-request store objects over one backing store', () => {
    const client = { clientId: 'app', redirectUri: 'https://app.example/cb' }
    createAuth({ metadata: metaFor('https://attacker.example'), client, flows: memoryFlowStore(), binding: B, redirect: () => {} })
    expect(() => createAuth({ metadata: metaFor('https://github.com'), client, flows: memoryFlowStore(), binding: B, redirect: () => {} })).toThrow(
      /share the redirect URI https:\/\/app\.example\/cb/,
    )
    _resetRedirectClaims()
    const kv = new Map<string, PendingFlow>()
    const storeFor = (): FlowStore => ({
      save: (k, v) => void kv.set(k, v),
      take: (k) => {
        const v = kv.get(k) ?? null
        kv.delete(k)

        return v
      },
    })
    createAuth({ metadata: metaFor('https://attacker.example'), client, flows: storeFor(), binding: B, redirect: () => {} })
    expect(() => createAuth({ metadata: metaFor('https://github.com'), client, flows: storeFor(), binding: B, redirect: () => {} })).toThrow(/share the redirect URI/)
  })

  it('discovered providers: a provider without iss cannot sign in on a shared URI, and a callback there must carry iss', async () => {
    const posts: string[] = []
    const discovery = (iss: string, sendsIss: boolean): FetchLike => async (u) => {
      if (u.endsWith('openid-configuration')) return json(metaFor(iss, sendsIss ? { authorization_response_iss_parameter_supported: true } : {}))
      posts.push(u)

      return json({ access_token: 'at', token_type: 'Bearer' })
    }
    const client = { clientId: 'app', redirectUri: 'https://app.example/cb' }
    let last = ''
    // Both constructed with discovery: iss support is unknown until sign-in.
    const honest = createAuth({ issuer: 'https://github.example', client, flows: memoryFlowStore(), binding: B, redirect: () => {}, fetch: discovery('https://github.example', false) })
    const attacker = createAuth({ issuer: 'https://attacker.example', client, flows: memoryFlowStore(), binding: B, redirect: (u) => (last = u), fetch: discovery('https://attacker.example', false) })
    await attacker.signIn()
    expect(attacker.error()?.code).toBe('redirect_shared')
    expect(last).toBe('')
    honest.dispose()
    attacker.dispose()
    // An attacker that claims iss support may sign in, but a callback without iss is refused.
    const lying = createAuth({ issuer: 'https://liar.example', client, flows: memoryFlowStore(), binding: B, redirect: (u) => (last = u), fetch: discovery('https://liar.example', true) })
    const honest2 = createAuth({ issuer: 'https://github.example', client, flows: memoryFlowStore(), binding: B, redirect: () => {}, fetch: discovery('https://github.example', false) })
    await lying.signIn()
    const state = new URL(last).searchParams.get('state')
    await lying.handleCallback(`https://app.example/cb?code=HONEST_CODE&state=${state}`)
    expect(lying.error()?.code).toBe('issuer_missing')
    expect(posts).toEqual([])
    honest2.dispose()
  })

  it('a callback on a URI that became shared must carry iss, even for a sign-in started before', async () => {
    const posts: string[] = []
    const discovery = (iss: string): FetchLike => async (u) => {
      if (u.endsWith('openid-configuration')) return json(metaFor(iss))
      posts.push(u)

      return json({ access_token: 'at', token_type: 'Bearer' })
    }
    const client = { clientId: 'app', redirectUri: 'https://app.example/cb' }
    let last = ''
    const flows = memoryFlowStore()
    const a = createAuth({ issuer: 'https://a.example', client, flows, binding: B, redirect: (u) => (last = u), fetch: discovery('https://a.example') })
    await a.signIn() // alone on the URI: allowed
    // The redirect page is a new page load: every provider is constructed again, none discovered yet.
    _resetRedirectClaims()
    const aAgain = createAuth({ issuer: 'https://a.example', client, flows, binding: B, redirect: () => {}, fetch: discovery('https://a.example') })
    createAuth({ issuer: 'https://b.example', client, flows: memoryFlowStore(), binding: B, redirect: () => {}, fetch: discovery('https://b.example') })
    await aAgain.handleCallback(`https://app.example/cb?code=c&state=${new URL(last).searchParams.get('state')}`)
    expect(aAgain.error()?.code).toBe('issuer_missing')
    expect(posts).toEqual([])
  })

  it('allows tenants that all send iss to share one URI, and releases a claim on dispose', async () => {
    const client = { clientId: 'app', redirectUri: 'https://app.example/cb' }
    const t1 = createAuth({ metadata: metaFor('https://sso.example/realms/t1', { authorization_response_iss_parameter_supported: true }), client, flows: memoryFlowStore(), binding: B, redirect: () => {} })
    createAuth({ metadata: metaFor('https://sso.example/realms/t2', { authorization_response_iss_parameter_supported: true }), client, flows: memoryFlowStore(), binding: B, redirect: () => {} })
    expect(() => createAuth({ metadata: metaFor('https://github.com'), client, flows: memoryFlowStore(), binding: B, redirect: () => {} })).toThrow(/share the redirect URI/)
    t1.dispose()
    t1.dispose() // idempotent
    _resetRedirectClaims()
    const a = createAuth({ metadata: metaFor('https://github.com'), client, flows: memoryFlowStore(), binding: B, redirect: () => {} })
    a.dispose()
    // With the claim released, another provider may take the URI (a realm switch).
    expect(() => createAuth({ metadata: metaFor('https://gitlab.example'), client, flows: memoryFlowStore(), binding: B, redirect: () => {} })).not.toThrow()
  })
})

describe('server callbacks behind a proxy', () => {
  it('accepts the request path and query, resolved against the configured redirect origin', async () => {
    const flows = memoryFlowStore()
    const client = { clientId: 'bff', redirectUri: 'https://app.example.com/auth/callback' }
    const cfg = { metadata: metaFor('https://idp.example'), client, flows, binding: B, fetch: (() => json({ access_token: 'at', token_type: 'Bearer' })) as FetchLike }
    let loc = ''
    await createAuth({ ...cfg, redirect: (u) => (loc = u) }).signIn()
    const state = new URL(loc).searchParams.get('state')
    // What the server sees behind a TLS-terminating proxy: its internal URL…
    const internal = createAuth({ ...cfg, redirect: () => {} })
    await internal.handleCallback(`http://127.0.0.1:3000/auth/callback?code=c&state=${state}`)
    expect(internal.error()?.code).toBe('redirect_mismatch')
    expect(internal.error()?.message).toMatch(/proxy/)
    // …so pass the path (Node's req.url): it resolves against the configured public origin.
    await createAuth({ ...cfg, redirect: (u) => (loc = u) }).signIn()
    const state2 = new URL(loc).searchParams.get('state')
    const ok = createAuth({ ...cfg, redirect: () => {} })
    await ok.handleCallback(`/auth/callback?code=c&state=${state2}`)
    expect(ok.status()).toBe('signedIn')
  })

  it('parseCallback refuses a path with a clear error, not a TypeError', async () => {
    const m = metaFor('https://idp.example')
    const { flow } = await beginAuthorization(m, { clientId: 'c', redirectUri: 'https://app.example/cb' }, B)
    expect(() => parseCallback('/cb?code=c', flow, m, B)).toThrow(expect.objectContaining({ code: 'invalid_callback' }))
  })
})

describe('response_mode is reserved', () => {
  it('cannot be set through authorizationParams (form_post would drop the binding cookie)', async () => {
    await expect(
      beginAuthorization(metaFor('https://idp.example'), { clientId: 'c', redirectUri: 'https://app.example/cb', authorizationParams: { response_mode: 'form_post' } }, B),
    ).rejects.toMatchObject({ code: 'reserved_param' })
  })
})

describe('TOTP secret length', () => {
  it('requires 128 bits, or 80 behind allowShortSecret', async () => {
    await expect(verifyTotp('AA', '123456')).rejects.toThrow(/at least 128/)
    const legacy = 'JBSWY3DPEHPK3PXP' // 80 bits
    await expect(totp(legacy)).rejects.toThrow(/allowShortSecret/)
    const code = await totp(legacy, { allowShortSecret: true, now: 0 })
    expect(await verifyTotp(legacy, code, { allowShortSecret: true, now: 0 })).toMatchObject({ ok: true })
    await expect(verifyTotp('AA', '123456', { allowShortSecret: true })).rejects.toThrow(/at least 80/)
  })
})

describe('safeReturnTo — depth and path parameters', () => {
  it('refuses a value still changing after three decodes, and ;-parameters hiding //', () => {
    for (const v of ['/%2525252F%2525252Fevil', '/;//evil', '/;x=1//evil', '/a/..;/..;//evil']) expect(safeReturnTo(v), v).toBe('/')
    expect(safeReturnTo('/a;v=1/b')).toBe('/a;v=1/b')
    expect(safeReturnTo('/x%25252Fy')).toBe('/x%25252Fy') // three layers: decodes to /x/y, stays on the site
  })
})

describe('redirect matching — one rule on web, iOS and Android', () => {
  const root = join(import.meta.dirname, '..', '..')
  const vectors = JSON.parse(readFileSync(join(root, 'native', 'tests', 'redirect-vectors.json'), 'utf8')) as [string, string][]
  it('the web rule produces every vector key', () => {
    for (const [uri, key] of vectors) expect(redirectTarget(uri) ?? '', uri).toBe(key) // '' = refused
  })
  it('the Swift and Kotlin tests embed the same vectors', () => {
    const one = JSON.stringify(vectors)
    for (const f of ['PyreonOidcTests.swift', 'PyreonOidcTest.kt']) {
      const src = readFileSync(join(root, 'native', 'tests', f), 'utf8')
      const region = src.slice(src.indexOf('// <redirect-vectors:begin>'), src.indexOf('// <redirect-vectors:end>'))
      expect(region, f).toContain(one)
    }
  })
})

describe('refresh and the epoch', () => {
  it('a refresh that starts while a callback is in flight neither discards it nor overwrites it', async () => {
    let releaseExchange = () => {}
    const exchangeGate = new Promise<void>((r) => (releaseExchange = r))
    let exchanges = 0
    const f: FetchLike = async (_u, init) => {
      const body = new URLSearchParams(String(init?.body))
      if (body.get('grant_type') === 'authorization_code') {
        exchanges++
        if (exchanges === 2) await exchangeGate

        return json({ access_token: `at-signin-${exchanges}`, token_type: 'Bearer', refresh_token: `rt-${exchanges}` })
      }

      return json({ access_token: 'at-refreshed', token_type: 'Bearer', refresh_token: 'rt-r' })
    }
    const redirects: string[] = []
    const auth = createAuth({ metadata: metaFor('https://idp.example'), client: { clientId: 'app', redirectUri: 'https://app.example/cb' }, flows: memoryFlowStore(), binding: B, redirect: (u) => redirects.push(u), fetch: f })
    const cb = (i: number) => `https://app.example/cb?code=c&state=${new URL(redirects[i]!).searchParams.get('state')}`
    await auth.signIn()
    await auth.handleCallback(cb(0))
    await auth.signIn()
    const second = auth.handleCallback(cb(1)) // in flight: its code exchange waits
    await new Promise((r) => setTimeout(r, 0))
    const refreshed = auth.refresh() // started while the callback is in flight
    await refreshed
    releaseExchange()
    await second
    expect(auth.status()).toBe('signedIn')
    expect(auth.tokens()?.access_token).toBe('at-signin-2')
  })
})
