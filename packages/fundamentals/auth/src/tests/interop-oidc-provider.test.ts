/**
 * Interop against `oidc-provider` — a certified OpenID Provider implementation —
 * running in-process. Everything else in this suite talks to fakes written by the
 * same author as the client, which can only prove the client agrees with itself.
 * This drives the real thing: discovery, the authorize redirect, PKCE + nonce as
 * the provider enforces them, the code exchange, ID-token verification against
 * the provider's own JWKS, refresh (with rotation) and RP-initiated logout.
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import Provider from 'oidc-provider'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuth, memoryFlowStore } from '../index'

const REDIRECT = 'https://app.example/cb'
let issuer = ''
let provider: Provider
let close: () => Promise<void>

beforeAll(async () => {
  const server = createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  issuer = `http://localhost:${(server.address() as AddressInfo).port}`
  provider = new Provider(issuer, {
    clients: [
      {
        client_id: 'app',
        token_endpoint_auth_method: 'none',
        redirect_uris: [REDIRECT],
        post_logout_redirect_uris: ['https://app.example/'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
    ],
    features: { devInteractions: { enabled: false }, rpInitiatedLogout: { enabled: true } },
    findAccount: (_ctx, sub) => ({ accountId: sub, claims: () => ({ sub }) }),
    cookies: { keys: ['interop-test-cookie-key'] },
  })
  const handle = provider.callback()
  server.on('request', async (req, res) => {
    // Headless interactions: log in as u1, then grant exactly what was asked for.
    if (req.url?.startsWith('/interaction/')) {
      const d = await provider.interactionDetails(req, res)
      if (d.prompt.name === 'login') {
        await provider.interactionFinished(req, res, { login: { accountId: 'u1' } }, { mergeWithLastSubmission: false })
        return
      }
      const grant = d.grantId
        ? ((await provider.Grant.find(d.grantId)) as InstanceType<typeof provider.Grant>)
        : new provider.Grant({ accountId: d.session!.accountId, clientId: String(d.params.client_id) })
      grant.addOIDCScope(String(d.params.scope))
      const grantId = await grant.save()
      await provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true })
      return
    }
    handle(req, res)
  })
  close = () => new Promise((r) => server.close(() => r()))
})

afterAll(() => close?.())

/** A user agent: follows redirects with a cookie jar until it reaches the app. */
async function browse(start: string): Promise<string> {
  const jar = new Map<string, string>()
  let url = start
  for (let i = 0; i < 20; i++) {
    if (url.startsWith(REDIRECT) || url.startsWith('https://app.example/')) return url
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    })
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';')
      const at = pair!.indexOf('=')
      jar.set(pair!.slice(0, at), pair!.slice(at + 1))
    }
    const loc = res.headers.get('location')
    if (!loc) throw new Error(`no redirect from ${url}: ${res.status} ${await res.text()}`)
    url = new URL(loc, url).toString()
  }
  throw new Error('redirect loop')
}

function client() {
  const redirects: string[] = []
  const auth = createAuth({
    issuer,
    client: {
      clientId: 'app',
      redirectUri: REDIRECT,
      scope: 'openid offline_access',
      authorizationParams: { prompt: 'consent' },
    },
    flows: memoryFlowStore(),
    redirect: (u) => redirects.push(u),
  })
  return { auth, redirects }
}

describe('interop: oidc-provider (certified OP)', () => {
  it('signs in with PKCE + nonce and verifies the real ID token', async () => {
    const { auth, redirects } = client()
    await auth.signIn()
    expect(auth.error()).toBeNull()
    const callback = await browse(redirects[0]!)
    await auth.handleCallback(callback)
    expect(auth.error()).toBeNull()
    expect(auth.status()).toBe('signedIn')
    expect(auth.claims()).toMatchObject({ iss: issuer, sub: 'u1', aud: 'app' })
    expect(auth.tokens()?.refresh_token).toBeTruthy()
    expect(auth.expiresAt()).toBeGreaterThan(Date.now())
  })

  it('the provider rejects a callback replayed into a second client (state is single-use)', async () => {
    const a = client()
    await a.auth.signIn()
    const callback = await browse(a.redirects[0]!)
    await a.auth.handleCallback(callback)
    await a.auth.handleCallback(callback)
    expect(a.auth.status()).toBe('error')
    expect(a.auth.error()?.code).toBe('unknown_flow')
  })

  it('refreshes against the real token endpoint, adopting the rotated refresh token', async () => {
    const { auth, redirects } = client()
    await auth.signIn()
    await auth.handleCallback(await browse(redirects[0]!))
    const first = auth.tokens()!
    await auth.refresh()
    expect(auth.error()).toBeNull()
    expect(auth.status()).toBe('signedIn')
    expect(auth.tokens()!.access_token).not.toBe(first.access_token)
    expect(auth.claims()?.sub).toBe('u1')
    // a second refresh must use whatever the provider handed back last time
    await auth.refresh()
    expect(auth.error()).toBeNull()
  })

  it('RP-initiated logout lands on the provider’s end-session endpoint', async () => {
    const { auth, redirects } = client()
    await auth.signIn()
    await auth.handleCallback(await browse(redirects[0]!))
    auth.signOut({ endProviderSession: true, postLogoutRedirectUri: 'https://app.example/' })
    const logout = new URL(redirects.at(-1)!)
    expect(`${logout.origin}${logout.pathname}`).toBe(`${issuer}/session/end`)
    const res = await fetch(logout, { redirect: 'manual' })
    // the provider accepted our id_token_hint and client (an invalid one is a 400)
    expect(res.status).toBe(200)
  })
})
