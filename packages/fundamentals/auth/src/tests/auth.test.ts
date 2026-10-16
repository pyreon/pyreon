import { describe, expect, it } from 'vitest'
import {
  AuthError,
  base64url,
  beginAuthorization,
  codeChallengeS256,
  createGuard,
  discover,
  exchangeCode,
  generateCodeVerifier,
  parseCallback,
  safeReturnTo,
} from '../index'
import type { OidcMetadata } from '../index'

const meta: OidcMetadata = {
  issuer: 'https://idp.example',
  authorization_endpoint: 'https://idp.example/auth',
  token_endpoint: 'https://idp.example/token',
}
const client = { clientId: 'app', redirectUri: 'https://app.example/cb' }

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

describe('pkce', () => {
  it('matches the RFC 7636 Appendix B vector', async () => {
    expect(await codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
  it('verifier is 43 url-safe chars and unique', () => {
    const a = generateCodeVerifier()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(generateCodeVerifier())
  })
  it('base64url strips padding and unsafe chars', () => {
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe('-__-')
  })
})

describe('discover', () => {
  it('accepts a matching issuer', async () => {
    expect((await discover('https://idp.example/', () => json(meta))).token_endpoint).toBe(meta.token_endpoint)
  })
  it('rejects issuer mismatch', async () => {
    await expect(discover('https://idp.example', () => json({ ...meta, issuer: 'https://evil.example' }))).rejects.toMatchObject({
      code: 'issuer_mismatch',
    })
  })
  it('rejects non-https issuer and non-https endpoints', async () => {
    await expect(discover('http://idp.example', () => json(meta))).rejects.toMatchObject({ code: 'insecure_url' })
    await expect(
      discover('https://idp.example', () => json({ ...meta, token_endpoint: 'http://idp.example/t' })),
    ).rejects.toMatchObject({ code: 'insecure_url' })
  })
  it('allows loopback http for dev, rejects bad URLs and non-200', async () => {
    await expect(
      discover('http://localhost:8080', () => json({ ...meta, issuer: 'http://localhost:8080' })),
    ).resolves.toBeTruthy()
    await expect(discover('nope', () => json(meta))).rejects.toMatchObject({ code: 'invalid_url' })
    await expect(discover('https://idp.example', () => json({}, 500))).rejects.toMatchObject({ code: 'discovery_failed' })
  })
})

describe('authorization round trip', () => {
  it('builds an S256 + state + nonce request', async () => {
    const { url, flow } = await beginAuthorization(meta, client)
    const p = new URL(url).searchParams
    expect(p.get('response_type')).toBe('code')
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.get('code_challenge')).toBe(await codeChallengeS256(flow.codeVerifier))
    expect(p.get('state')).toBe(flow.state)
    expect(p.get('nonce')).toBe(flow.nonce)
    expect(p.get('scope')).toBe('openid profile email')
  })

  it('accepts a valid callback', async () => {
    const { flow } = await beginAuthorization(meta, client)
    const cb = `https://app.example/cb?code=abc&state=${flow.state}&iss=${encodeURIComponent(meta.issuer)}`
    expect(parseCallback(cb, flow, meta)).toEqual({ code: 'abc' })
  })

  it('rejects state mismatch, provider error, mix-up, missing code, expiry', async () => {
    const { flow } = await beginAuthorization(meta, client, 1000)
    const bad = (q: string, now = 1000) => () => parseCallback(`https://app.example/cb?${q}`, flow, meta, now)
    expect(bad('code=a&state=wrong')).toThrow(AuthError)
    expect(bad(`error=access_denied&state=${flow.state}`)).toThrow(/provider returned/)
    expect(bad(`code=a&state=${flow.state}&iss=https://evil.example`)).toThrow(/mix-up/)
    expect(bad(`state=${flow.state}`)).toThrow(/no code/)
    expect(bad(`code=a&state=${flow.state}`, 1000 + 11 * 60_000)).toThrow(/expired/)
  })

  it('requires iss when the provider advertises it', async () => {
    const { flow } = await beginAuthorization(meta, client)
    const m = { ...meta, authorization_response_iss_parameter_supported: true }
    expect(() => parseCallback(`https://app.example/cb?code=a&state=${flow.state}`, flow, m)).toThrow(/omitted it/)
  })

  it('exchanges the code with the verifier and no secret', async () => {
    const { flow } = await beginAuthorization(meta, client)
    let body = ''
    const t = await exchangeCode(
      meta,
      client,
      flow,
      'abc',
      (_u, init) => {
        body = String(init?.body)
        return json({ access_token: 'at', token_type: 'Bearer' })
      },
    )
    expect(t.access_token).toBe('at')
    const p = new URLSearchParams(body)
    expect(p.get('code_verifier')).toBe(flow.codeVerifier)
    expect(p.has('client_secret')).toBe(false)
  })

  it('rejects failed or malformed token responses', async () => {
    const { flow } = await beginAuthorization(meta, client)
    await expect(exchangeCode(meta, client, flow, 'a', () => json({}, 400))).rejects.toMatchObject({
      code: 'token_exchange_failed',
    })
    await expect(
      exchangeCode(meta, client, flow, 'a', () => json({ access_token: 'x', token_type: 'mac' })),
    ).rejects.toMatchObject({ code: 'bad_token_response' })
  })
})

describe('guard', () => {
  it('passes a signed-in session, redirects otherwise with a safe returnTo', () => {
    let s: { admin: boolean } | null = null
    const g = createGuard({ session: () => s, loginPath: '/login', allow: (x) => x.admin })
    expect(g('/a?b=1')).toEqual({ redirect: '/login?returnTo=%2Fa%3Fb%3D1' })
    s = { admin: false }
    expect(g('/a')).toEqual({ redirect: '/login?returnTo=%2Fa' })
    s = { admin: true }
    expect(g('/a')).toBe(true)
  })
  it('blocks open redirects', () => {
    for (const v of ['//evil.example', 'https://evil.example', '/\\evil', null, '']) expect(safeReturnTo(v)).toBe('/')
    expect(safeReturnTo('/ok?x=1')).toBe('/ok?x=1')
    const g = createGuard({ session: () => null, loginPath: '/login' })
    expect(g('//evil.example')).toEqual({ redirect: '/login?returnTo=%2F' })
  })
})
