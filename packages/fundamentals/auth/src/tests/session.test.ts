import { describe, expect, it } from 'vitest'
import { createAuth, facebook, github, memoryFlowStore, sessionCookie, signSession, verifySession } from '../index'

const A = 'a'.repeat(32)
const B = 'b'.repeat(32)

describe('session', () => {
  it('round-trips and expires', async () => {
    const v = await signSession({ sub: 'u1', role: 'admin' }, { secrets: [A], maxAge: 10 }, 0)
    expect(await verifySession(v, { secrets: [A] }, 5000)).toMatchObject({ sub: 'u1', role: 'admin' })
    expect(await verifySession(v, { secrets: [A] }, 11_000)).toBeNull()
  })
  it('rejects tampering, wrong secret, garbage', async () => {
    const v = await signSession({ sub: 'u1' }, { secrets: [A] })
    const [body, sig] = v.split('.')
    expect(await verifySession(`${body}x.${sig}`, { secrets: [A] })).toBeNull()
    expect(await verifySession(v, { secrets: [B] })).toBeNull()
    for (const g of ['', 'nodot', '.x', 'a.b', 'x'.repeat(5000)]) expect(await verifySession(g, { secrets: [A] })).toBeNull()
  })
  it('rotates: new secret signs, old still verifies', async () => {
    const old = await signSession({ sub: 'u1' }, { secrets: [A] })
    expect((await verifySession(old, { secrets: [B, A] }))?.sub).toBe('u1')
    expect(await verifySession(old, { secrets: [B] })).toBeNull()
  })
  it('enforces secret length and the cookie size cap', async () => {
    await expect(signSession({ sub: 'u' }, { secrets: ['short'] })).rejects.toThrow(/32 characters/)
    await expect(signSession({ sub: 'u', big: 'x'.repeat(5000) }, { secrets: [A] })).rejects.toThrow(/4096/)
  })
  it('a token without sub or exp is rejected even if validly signed', async () => {
    const enc = new TextEncoder()
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    const body = b64({ nosub: 1 })
    const key = await crypto.subtle.importKey('raw', enc.encode(A), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    expect(await verifySession(`${body}.${sig}`, { secrets: [A] })).toBeNull()
  })
  it('cookie has secure attributes', () => {
    expect(sessionCookie('s', 'v')).toBe('__Host-s=v; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800')
  })
})

describe('non-OIDC providers', () => {
  it('github/facebook endpoints are https; createAuth skips discovery with metadata', async () => {
    expect(github.authorization_endpoint.startsWith('https://')).toBe(true)
    expect(facebook('v20.0').token_endpoint).toContain('/v20.0/')
    const out: string[] = []
    const auth = createAuth({
      metadata: github,
      client: { clientId: 'x', redirectUri: 'https://app.example/cb' },
      flows: memoryFlowStore(),
      redirect: (u) => out.push(u),
      fetch: () => Promise.reject(new Error('discovery must not run')),
    })
    await auth.signIn()
    expect(out[0]).toContain('github.com/login/oauth/authorize')
  })
})
