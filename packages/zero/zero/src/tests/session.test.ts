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
    const signer = createSigner([SECRET])
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
