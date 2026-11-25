// Fixes from the fifth security review of PR #4773 (rv-4773/probe-r5.ts, as tests).
import { afterEach, describe, expect, it } from 'vitest'
import { createAuth, memoryFlowStore, useOidc } from '../index'
import type { FetchLike, OidcMetadata } from '../index'
import { _resetRedirectClaims } from '../redirects'

afterEach(() => _resetRedirectClaims())

const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }))

const meta: OidcMetadata = {
  issuer: 'https://idp.example',
  authorization_endpoint: 'https://idp.example/a',
  token_endpoint: 'https://idp.example/t',
  jwks_uri: 'https://idp.example/jwks',
}

const B = 'b'.repeat(43)

describe('a refresh whose ID token cannot be verified yet', () => {
  it('keeps the rotated refresh token, so the retry does not present the spent one', async () => {
    const presented: string[] = []
    let jwksUp = false
    let n = 0
    const f: FetchLike = async (u, init) => {
      if (u.endsWith('/jwks')) return jwksUp ? json({ keys: [] }) : json({}, 503)
      const body = new URLSearchParams(String(init?.body))
      if (body.get('grant_type') === 'authorization_code') return json({ access_token: 'at0', token_type: 'Bearer', refresh_token: 'rt0' })
      presented.push(body.get('refresh_token')!)
      n++
      // The first refresh rotates AND returns an ID token (whose keys are unreachable); the retry returns none.
      return json({ access_token: `at${n}`, token_type: 'Bearer', refresh_token: `rt${n}`, ...(n === 1 ? { id_token: 'x.y.z' } : {}) })
    }
    let loc = ''
    const auth = createAuth({ metadata: meta, client: { clientId: 'c', redirectUri: 'https://app.example/cb' }, flows: memoryFlowStore(), binding: B, redirect: (u) => (loc = u), fetch: f })
    await auth.signIn()
    await auth.handleCallback(`https://app.example/cb?code=x&state=${new URL(loc).searchParams.get('state')}`)
    await auth.refresh()
    expect(auth.error()?.code).toBe('jwks_failed')
    expect(auth.status()).toBe('error')
    jwksUp = true
    await auth.refresh()
    expect(presented).toEqual(['rt0', 'rt1'])
    expect(auth.status()).toBe('signedIn')
  })
})

describe('useOidc().accessToken()', () => {
  it('never returns an expired token', async () => {
    let expiresIn = 3600
    const f: FetchLike = async (u) => (u.endsWith('openid-configuration') ? json(meta) : json({ access_token: 'at', token_type: 'Bearer', expires_in: expiresIn }))
    let loc = ''
    const auth = useOidc({ issuer: meta.issuer, clientId: 'c', redirectUri: 'https://app.example/cb', fetch: f, flows: memoryFlowStore(), redirect: (u) => (loc = u) })
    const signIn = async () => {
      await auth.signIn()
      await auth.handleCallback(`https://app.example/cb?code=x&state=${new URL(loc).searchParams.get('state')}`)
    }
    await signIn()
    expect(auth.accessToken()).toBe('at')
    expiresIn = -1 // a token that has already expired
    await signIn()
    expect(auth.status()).toBe('signedIn')
    expect(auth.accessToken()).toBeNull()
  })
})
