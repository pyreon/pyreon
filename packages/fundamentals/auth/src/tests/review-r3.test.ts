// Fixes from the third security review of PR #4773 (rv-4773/probe-r3.ts, as tests).
import { afterEach, describe, expect, it } from 'vitest'
import { createAuth, memoryFlowStore } from '../index'
import type { FetchLike, OidcMetadata } from '../index'
import { _resetRedirectClaims } from '../redirects'

afterEach(() => _resetRedirectClaims())

const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }))

const metaFor = (iss: string): OidcMetadata => ({ issuer: iss, authorization_endpoint: `${iss}/authorize`, token_endpoint: `${iss}/token` })

const B = 'b'.repeat(43)

describe('refresh() after a sign-out and a new sign-in', () => {
  it('starts a refresh for the new session instead of returning the old one still in flight', async () => {
    const gates: (() => void)[] = []
    let refreshRequests = 0
    const f: FetchLike = async (_u, init) => {
      const body = new URLSearchParams(String(init?.body))
      if (body.get('grant_type') === 'authorization_code') {
        const code = body.get('code')

        return json({ access_token: `at-${code}`, token_type: 'Bearer', refresh_token: `rt-${code}` })
      }
      refreshRequests++
      const rt = body.get('refresh_token')
      await new Promise<void>((r) => gates.push(r))

      return json({ access_token: `at-refreshed-${rt}`, token_type: 'Bearer', refresh_token: `${rt}-next` })
    }
    let loc = ''
    const auth = createAuth({ metadata: metaFor('https://idp.example'), client: { clientId: 'c', redirectUri: 'https://app/cb' }, flows: memoryFlowStore(), binding: B, redirect: (u) => (loc = u), fetch: f })
    const signInWith = async (code: string) => {
      await auth.signIn()
      await auth.handleCallback(`https://app/cb?code=${code}&state=${new URL(loc).searchParams.get('state')}`)
    }
    await signInWith('one')
    const stale = auth.refresh()
    await new Promise((r) => setTimeout(r, 0))
    auth.signOut()
    await signInWith('two')
    const fresh = auth.refresh()
    expect(fresh).not.toBe(stale)
    await new Promise((r) => setTimeout(r, 0))
    for (const g of gates) g()
    await Promise.all([stale, fresh])
    expect(refreshRequests).toBe(2)
    expect(auth.tokens()?.access_token).toBe('at-refreshed-rt-two')
  })
})

describe('dispose() does not retire an instance', () => {
  it('a later sign-in registers it again, so another provider on its URI is refused again', async () => {
    const client = { clientId: 'app', redirectUri: 'https://app.example/cb' }
    let last = ''
    const a = createAuth({ metadata: metaFor('https://a.example'), client, flows: memoryFlowStore(), binding: B, redirect: (u) => (last = u) })
    a.dispose()
    await a.signIn()
    expect(last).not.toBe('')
    expect(() => createAuth({ metadata: metaFor('https://b.example'), client, flows: memoryFlowStore(), binding: B, redirect: () => {} })).toThrow(/share the redirect URI/)
  })
})
