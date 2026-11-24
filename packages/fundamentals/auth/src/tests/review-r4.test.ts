// Fixes from the fourth security review of PR #4773 (rv-4773/probe-r4.ts, as tests).
import { afterEach, describe, expect, it } from 'vitest'
import { beginAuthorization, createAuth, memoryFlowStore, parseCallback } from '../index'
import type { FetchLike, OidcMetadata, PendingFlow } from '../index'
import { _resetRedirectClaims } from '../redirects'

afterEach(() => _resetRedirectClaims())

const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }))

const meta: OidcMetadata = { issuer: 'https://idp.example', authorization_endpoint: 'https://idp.example/a', token_endpoint: 'https://idp.example/t' }

const B = 'b'.repeat(43)

describe('redirect matching fails closed', () => {
  it('a callback is refused when either side is a spelling the matcher refuses (null is not a match)', () => {
    const flow = (redirectUri: string): PendingFlow => ({ state: 's', nonce: 'n', codeVerifier: 'v', issuer: meta.issuer, clientId: 'c', redirectUri, binding: B, createdAt: Date.now() })
    for (const [configured, callback] of [
      ['https://bücher.example/cb', 'https://evil.example\\x'],
      ['https://app.example/%2e/cb', 'https://evil.example/a b'],
      ['https://app.example/cb', 'https://evil.example\\x'],
    ] as const) {
      expect(() => parseCallback(`${callback}?code=c&state=s`, flow(configured), meta, B), `${configured} <- ${callback}`).toThrow(
        expect.objectContaining({ code: 'redirect_mismatch' }),
      )
    }
  })

  it('a redirect URI the matcher refuses is rejected at construction, naming the fix', async () => {
    expect(() => createAuth({ metadata: meta, client: { clientId: 'c', redirectUri: 'https://bücher.example/cb' }, flows: memoryFlowStore(), binding: B, redirect: () => {} })).toThrow(
      /\[Pyreon\] auth: redirect URI .* punycode/,
    )
    await expect(beginAuthorization(meta, { clientId: 'c', redirectUri: 'https://app.example/%2e/cb' }, B)).rejects.toMatchObject({ code: 'invalid_redirect_uri' })
  })
})

describe('a failed refresh', () => {
  it('keeps the session for a retry when the provider is unreachable or unavailable, and ends it on a refusal', async () => {
    let refreshStatus = 200
    let refreshes = 0
    const f: FetchLike = async (_u, init) => {
      const body = new URLSearchParams(String(init?.body))
      if (body.get('grant_type') === 'authorization_code') return json({ access_token: 'at0', token_type: 'Bearer', refresh_token: 'rt0' })
      if (refreshStatus === 0) throw new TypeError('Failed to fetch')
      if (refreshStatus !== 200) return json({ error: refreshStatus === 400 ? 'invalid_grant' : 'unavailable' }, refreshStatus)

      return json({ access_token: `at${++refreshes}`, token_type: 'Bearer', refresh_token: 'rt0' })
    }
    let loc = ''
    const auth = createAuth({ metadata: meta, client: { clientId: 'c', redirectUri: 'https://app.example/cb' }, flows: memoryFlowStore(), binding: B, redirect: (u) => (loc = u), fetch: f })
    await auth.signIn()
    await auth.handleCallback(`https://app.example/cb?code=x&state=${new URL(loc).searchParams.get('state')}`)
    for (const [status, code] of [[0, 'network_error'], [503, 'provider_unavailable'], [429, 'provider_unavailable']] as const) {
      refreshStatus = status
      await auth.refresh()
      expect(auth.status(), code).toBe('error')
      expect(auth.error()?.code).toBe(code)
      expect(auth.tokens()?.refresh_token, code).toBe('rt0') // kept for the retry
    }
    refreshStatus = 200
    await auth.refresh()
    expect(auth.status()).toBe('signedIn')
    refreshStatus = 400
    await auth.refresh()
    expect(auth.error()?.code).toBe('token_exchange_failed')
    expect(auth.tokens()).toBeNull()
  })
})
