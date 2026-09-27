import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { useLoaderData } from '@pyreon/router'
import type { MiddlewareContext } from '@pyreon/server'
import { createHandler } from '@pyreon/server'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { createISRHandler } from '../isr'
import { getSession, requireUser, sessionMiddleware, useSession } from '../session'
import { createSigner } from '../utils/signed-cookie'

const SECRET = 'a'.repeat(32)
const OLD = 'b'.repeat(32)

function ctxFor(url: string, cookie?: string): MiddlewareContext {
  const req = new Request(url, cookie ? { headers: { cookie } } : {})
  return { req, url: new URL(url), path: new URL(url).pathname, headers: new Headers(), locals: {} }
}

function cookieValue(headers: Headers, name = 'pyreon_session'): string | null {
  const c = headers.getSetCookie().find((x) => x.startsWith(`${name}=`))
  return c ? c.slice(name.length + 1).split(';')[0]! : null
}

async function roundTrip(secret: string | string[], seed: Record<string, unknown>) {
  const ctx = ctxFor('https://x.test/')
  await sessionMiddleware({ secret })(ctx)
  await getSession(ctx).update(seed)
  return cookieValue(ctx.headers)!
}

describe('sessionMiddleware', () => {
  it('round-trips a signed session', async () => {
    const v = await roundTrip(SECRET, { userId: 'u1' })
    const ctx = ctxFor('https://x.test/', `pyreon_session=${v}`)
    await sessionMiddleware({ secret: SECRET })(ctx)
    expect(getSession(ctx).get('userId')).toBe('u1')
  })

  it('a tampered cookie reads as an EMPTY session', async () => {
    const v = await roundTrip(SECRET, { userId: 'u1' })
    const [body, sig] = v.split('.')
    const forged = btoa(JSON.stringify({ d: { userId: 'admin' }, e: Date.now() + 1e6 }))
      .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
    for (const bad of [`${forged}.${sig}`, `${body}.${sig!.slice(0, -2)}AA`, 'garbage', `${body}`]) {
      const ctx = ctxFor('https://x.test/', `pyreon_session=${bad}`)
      await sessionMiddleware({ secret: SECRET })(ctx)
      expect(getSession(ctx).all()).toEqual({})
    }
  })

  it('an expired signature reads as empty even if the client kept the cookie', async () => {
    const signer = createSigner([SECRET], 'pyreon-session')
    const v = await signer.sign({ userId: 'u1' }, -1)
    const ctx = ctxFor('https://x.test/', `pyreon_session=${v}`)
    await sessionMiddleware({ secret: SECRET })(ctx)
    expect(getSession(ctx).has('userId')).toBe(false)
  })

  it('rotates keys: an old-secret cookie verifies; new cookies sign with secret[0]', async () => {
    const old = await roundTrip(OLD, { userId: 'u1' })
    const ctx = ctxFor('https://x.test/', `pyreon_session=${old}`)
    await sessionMiddleware({ secret: [SECRET, OLD] })(ctx)
    expect(getSession(ctx).get('userId')).toBe('u1')
    await getSession(ctx).set('userId', 'u2')
    const fresh = cookieValue(ctx.headers)!
    // Only the new secret now — the re-signed cookie must verify.
    const ctx2 = ctxFor('https://x.test/', `pyreon_session=${fresh}`)
    await sessionMiddleware({ secret: SECRET })(ctx2)
    expect(getSession(ctx2).get('userId')).toBe('u2')
    // And the old secret alone rejects it.
    const ctx3 = ctxFor('https://x.test/', `pyreon_session=${fresh}`)
    await sessionMiddleware({ secret: OLD })(ctx3)
    expect(getSession(ctx3).all()).toEqual({})
  })

  it('secure/httpOnly/sameSite defaults; localhost http drops Secure', async () => {
    const ctx = ctxFor('https://x.test/')
    await sessionMiddleware({ secret: SECRET })(ctx)
    await getSession(ctx).set('a', 1)
    const c = ctx.headers.getSetCookie()[0]!
    expect(c).toMatch(/HttpOnly/)
    expect(c).toMatch(/Secure/)
    expect(c).toMatch(/SameSite=Lax/)
    expect(c).toMatch(/Path=\//)
    const local = ctxFor('http://localhost:3000/')
    await sessionMiddleware({ secret: SECRET })(local)
    await getSession(local).set('a', 1)
    expect(local.headers.getSetCookie()[0]).not.toMatch(/Secure/)
  })

  it('refuses a cookie over the size limit with a [Pyreon] error', async () => {
    const ctx = ctxFor('https://x.test/')
    await sessionMiddleware({ secret: SECRET })(ctx)
    await expect(getSession(ctx).set('blob', 'x'.repeat(5000))).rejects.toThrow(/\[Pyreon\] session.*limit/)
  })

  it('destroy expires the cookie; repeated writes keep ONE session Set-Cookie', async () => {
    const ctx = ctxFor('https://x.test/')
    ctx.headers.append('set-cookie', 'other=1; Path=/')
    await sessionMiddleware({ secret: SECRET })(ctx)
    await getSession(ctx).set('a', 1)
    await getSession(ctx).set('b', 2)
    expect(ctx.headers.getSetCookie().filter((c) => c.startsWith('pyreon_session='))).toHaveLength(1)
    expect(ctx.headers.getSetCookie()).toContain('other=1; Path=/')
    await getSession(ctx).destroy()
    expect(ctx.headers.getSetCookie().find((c) => c.startsWith('pyreon_session='))).toMatch(/Max-Age=0/)
  })

  it('rejects short secrets', () => {
    expect(() => sessionMiddleware({ secret: 'short' })).toThrow(/\[Pyreon\].*32/)
    expect(() => sessionMiddleware({ secret: [] })).toThrow(/\[Pyreon\]/)
  })

  it('a request that never touches the session stays unmarked', async () => {
    const ctx = ctxFor('https://x.test/')
    await sessionMiddleware({ secret: SECRET })(ctx)
    expect(ctx.headers.get('cache-control')).toBeNull()
    getSession(ctx).get('userId')
    expect(ctx.headers.get('cache-control')).toBe('private, no-store')
    expect(ctx.headers.get('vary')).toBe('Cookie')
  })
})

describe('purpose binding (cross-context replay)', () => {
  it('a preview-signed value never verifies as a session under the SAME secret, and vice versa', async () => {
    const preview = createSigner([SECRET], 'pyreon-preview')
    const session = createSigner([SECRET], 'pyreon-session')
    const pv = await preview.sign({ userId: 'admin' }, 60)
    expect(await preview.verify(pv)).toEqual({ userId: 'admin' })
    expect(await session.verify(pv)).toBeNull()
    expect(await preview.verify(await session.sign(true, 60))).toBeNull()
    // Replayed under the session cookie NAME through the real middleware.
    const ctx = ctxFor('https://x.test/', `pyreon_session=${pv}`)
    await sessionMiddleware({ secret: SECRET })(ctx)
    expect(getSession(ctx).all()).toEqual({})
  })
})

describe('requireUser', () => {
  it('401 without redirectTo, 302 with next=, passes when authenticated', async () => {
    const anon = ctxFor('https://x.test/dash?tab=2')
    await sessionMiddleware({ secret: SECRET })(anon)
    const r401 = requireUser()(anon) as Response
    expect(r401.status).toBe(401)
    expect(r401.headers.get('cache-control')).toBe('private, no-store')
    const r302 = requireUser({ redirectTo: '/login' })(anon) as Response
    expect(r302.status).toBe(302)
    expect(r302.headers.get('location')).toBe('/login?next=%2Fdash%3Ftab%3D2')

    const v = await roundTrip(SECRET, { userId: 'u1' })
    const authed = ctxFor('https://x.test/dash', `pyreon_session=${v}`)
    await sessionMiddleware({ secret: SECRET })(authed)
    expect(requireUser()(authed)).toBeUndefined()
  })

  it('throws a [Pyreon] error when sessionMiddleware did not run', () => {
    expect(() => requireUser()(ctxFor('https://x.test/'))).toThrow(/\[Pyreon\] requireUser/)
  })
})

describe('getSession / useSession without sessionMiddleware', () => {
  it('throws a [Pyreon] error for every source shape when no session was attached', () => {
    const ctx = ctxFor('https://x.test/')
    expect(() => getSession(ctx)).toThrow(/\[Pyreon\] getSession: no session/)
    expect(() => getSession(ctx.req)).toThrow(/\[Pyreon\] getSession/)
    expect(() => getSession({ request: ctx.req })).toThrow(/\[Pyreon\] getSession/)
    expect(() => getSession({})).toThrow(/\[Pyreon\] getSession/)
  })

  it('resolves the same session from a Request and a loader context once the middleware ran', async () => {
    const ctx = ctxFor('https://x.test/')
    await sessionMiddleware({ secret: SECRET })(ctx)
    await getSession(ctx).set('userId', 'u9')
    expect(getSession(ctx.req).get('userId')).toBe('u9')
    expect(getSession({ request: ctx.req }).get('userId')).toBe('u9')
  })

  it('useSession() is null outside a request (no provided locals)', () => {
    expect(useSession()).toBeNull()
  })
})

describe('session cookie Secure attribute', () => {
  it('drops Secure for every loopback http host, keeps it for non-loopback http', async () => {
    for (const url of ['http://127.0.0.1:3000/', 'http://[::1]:3000/']) {
      const ctx = ctxFor(url)
      await sessionMiddleware({ secret: SECRET })(ctx)
      await getSession(ctx).set('a', 1)
      expect(ctx.headers.getSetCookie()[0]).not.toMatch(/Secure/)
    }
    const lan = ctxFor('http://192.168.1.5/')
    await sessionMiddleware({ secret: SECRET })(lan)
    await getSession(lan).set('a', 1)
    expect(lan.headers.getSetCookie()[0]).toMatch(/Secure/)
  })

  it('a verified non-object payload (array) reads as an empty session', async () => {
    const v = await createSigner([SECRET], 'pyreon-session').sign(['x'], 60)
    const ctx = ctxFor('https://x.test/', `pyreon_session=${v}`)
    await sessionMiddleware({ secret: SECRET })(ctx)
    expect(getSession(ctx).all()).toEqual({})
  })

  it('unset removes one key and re-signs; unsetting the last key expires the cookie', async () => {
    const ctx = ctxFor('https://x.test/')
    await sessionMiddleware({ secret: SECRET })(ctx)
    await getSession(ctx).update({ a: 1, b: 2 })
    await getSession(ctx).unset('a')
    const v = cookieValue(ctx.headers)!
    const next = ctxFor('https://x.test/', `pyreon_session=${v}`)
    await sessionMiddleware({ secret: SECRET })(next)
    expect(getSession(next).all()).toEqual({ b: 2 })
    await getSession(next).unset('b')
    expect(next.headers.getSetCookie()[0]).toMatch(/Max-Age=0/)
  })
})

describe('requireUser — redirect target and custom check', () => {
  it('a cross-origin redirectTo keeps the absolute URL; a custom nextParam and check are honoured', async () => {
    const anon = ctxFor('https://x.test/dash')
    await sessionMiddleware({ secret: SECRET })(anon)
    const res = requireUser({ redirectTo: 'https://auth.test/login', nextParam: 'return' })(anon) as Response
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://auth.test/login?return=%2Fdash')

    await getSession(anon).set('role', 'admin')
    expect(requireUser({ check: (s) => s.get('role') === 'admin' })(anon)).toBeUndefined()
  })
})

describe('session × ISR — a session-touching render is never cached', () => {
  // A custom cacheKey DISABLES ISR's request-credential refusal (it is the
  // documented per-user escape hatch), so this proves the session's own
  // `Cache-Control: private` marking is what keeps it out of the cache.
  const opts = { revalidate: 60, cacheKey: (req: Request) => new URL(req.url).pathname }

  async function build(page: ComponentFn, routeExtra: Partial<RouteRecord> = {}) {
    const routes: RouteRecord[] = [{ path: '/', component: page, ...routeExtra } as RouteRecord]
    const { App } = createApp({ routes, url: '/' })
    const handler = createHandler({ App, routes, middleware: [sessionMiddleware({ secret: SECRET })] })
    return createISRHandler(handler, opts)
  }

  it('component read via useSession() → BYPASS every time; user A never leaks to B', async () => {
    const Page: ComponentFn = () => h('p', null, `hi:${String(useSession()?.get('userId') ?? 'anon')}`)
    const isr = await build(Page)
    const a = await roundTrip(SECRET, { userId: 'alice' })
    const r1 = await isr(new Request('https://x.test/', { headers: { cookie: `pyreon_session=${a}` } }))
    expect(await r1.text()).toContain('hi:alice')
    expect(r1.headers.get('x-isr-cache')).toBe('BYPASS')
    expect(r1.headers.get('cache-control')).toBe('private, no-store')
    const r2 = await isr(new Request('https://x.test/'))
    expect(await r2.text()).toContain('hi:anon')
    expect(r2.headers.get('x-isr-cache')).toBe('BYPASS')
  })

  it('loader read via getSession({ request }) → BYPASS', async () => {
    const Page: ComponentFn = () => h('p', null, `u:${useLoaderData<{ u: string }>()?.u}`)
    const isr = await build(Page, {
      loader: ({ request }) => ({ u: String(getSession({ request }).get('userId') ?? 'anon') }),
    })
    const a = await roundTrip(SECRET, { userId: 'alice' })
    const r1 = await isr(new Request('https://x.test/', { headers: { cookie: `pyreon_session=${a}` } }))
    expect(await r1.text()).toContain('u:alice')
    expect(r1.headers.get('x-isr-cache')).toBe('BYPASS')
    const r2 = await isr(new Request('https://x.test/'))
    expect(await r2.text()).toContain('u:anon')
  })

  it('a page that never touches the session IS still cached', async () => {
    const isr = await build(() => h('p', null, 'public'))
    expect((await isr(new Request('https://x.test/'))).headers.get('x-isr-cache')).toBe('MISS')
    expect((await isr(new Request('https://x.test/'))).headers.get('x-isr-cache')).toBe('HIT')
  })
})
