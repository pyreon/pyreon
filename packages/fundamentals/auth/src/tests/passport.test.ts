import { describe, expect, it } from 'vitest'
import { runStrategy } from '../passport'
import type { PassportRequest } from '../passport'

// Mirrors passport-local's shape: reads credentials, calls success/fail/error on `this`.
class Local {
  authenticate(this: Record<string, (...a: unknown[]) => void>, req: PassportRequest) {
    const { username, password } = req.body as { username?: string; password?: string }
    if (!username) return this.fail!({ message: 'Missing credentials' }, 400)
    if (username === 'boom') return this.error!(new Error('db down'))
    if (username === 'throw') throw new Error('sync boom')
    if (password === 'pw') return this.success!({ id: 1, username }, { via: 'local' })
    return this.fail!('bad', 401)
  }
}
class OAuthLike {
  authenticate(this: Record<string, (...a: unknown[]) => void>, req: PassportRequest) {
    if (req.query.code) return this.success!({ id: 'o1' })
    req.session.state = 's123'
    return this.redirect!('https://idp.example/auth?state=s123')
  }
}
class Anon {
  authenticate(this: Record<string, (...a: unknown[]) => void>) {
    return this.pass!()
  }
}

describe('runStrategy', () => {
  it('success / fail outcomes', async () => {
    const s = new Local()
    expect(await runStrategy(s, { method: 'POST', url: '/login', body: { username: 'a', password: 'pw' } })).toEqual({
      type: 'success',
      user: { id: 1, username: 'a' },
      info: { via: 'local' },
    })
    expect(await runStrategy(s, { url: '/login', body: { username: 'a', password: 'x' } })).toMatchObject({ type: 'fail', status: 401 })
    expect(await runStrategy(s, { url: '/login' })).toMatchObject({ type: 'fail', status: 400 })
  })
  it('redirect writes strategy state into the supplied session', async () => {
    const session: Record<string, unknown> = {}
    const r = await runStrategy(new OAuthLike(), { url: '/auth/x', session })
    expect(r).toEqual({ type: 'redirect', url: 'https://idp.example/auth?state=s123', status: 302 })
    expect(session.state).toBe('s123')
    expect(await runStrategy(new OAuthLike(), { url: '/cb?code=abc' })).toMatchObject({ type: 'success' })
  })
  it('pass, async error and sync throw', async () => {
    expect(await runStrategy(new Anon(), { url: '/' })).toEqual({ type: 'pass' })
    await expect(runStrategy(new Local(), { url: '/', body: { username: 'boom' } })).rejects.toThrow('db down')
    await expect(runStrategy(new Local(), { url: '/', body: { username: 'throw' } })).rejects.toThrow('sync boom')
    await expect(
      runStrategy({ authenticate() { throw 'str' } }, { url: '/' }),
    ).rejects.toThrow('str')
  })
  it('does not mutate the shared strategy and lowercases headers', async () => {
    const s = new Local() as unknown as Record<string, unknown>
    let seen: PassportRequest | undefined
    const spy = { authenticate(this: Record<string, (...a: unknown[]) => void>, req: PassportRequest) { seen = req; this.pass!() } }
    await runStrategy(spy, { url: '/?a=1', headers: { 'X-Foo': 'b' } })
    expect(seen?.headers).toEqual({ 'x-foo': 'b' })
    expect(seen?.query).toEqual({ a: '1' })
    expect('success' in s).toBe(false)
  })
  it('error() with a non-Error value is wrapped', async () => {
    await expect(runStrategy({ authenticate() { (this as unknown as Record<string, (e: unknown) => void>).error!('x') } }, { url: '/' })).rejects.toThrow(/passport strategy error/)
  })
})
