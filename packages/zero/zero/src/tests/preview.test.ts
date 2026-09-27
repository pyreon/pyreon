import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { useLoaderData } from '@pyreon/router'
import type { MiddlewareContext } from '@pyreon/server'
import { createHandler } from '@pyreon/server'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { createISRHandler } from '../isr'
import { PREVIEW_COOKIE, createPreviewHandler, isPreview, previewMiddleware } from '../preview'

const SECRET = 'p'.repeat(32)
const TOKEN = 't'.repeat(32)

const ctxFor = (url: string, cookie?: string): MiddlewareContext => {
  const req = new Request(url, cookie ? { headers: { cookie } } : {})
  return { req, url: new URL(url), path: new URL(url).pathname, headers: new Headers(), locals: {} }
}

async function enableCookie(): Promise<string> {
  const res = await createPreviewHandler({ secret: SECRET, token: TOKEN })(
    ctxFor(`https://x.test/api/preview?token=${TOKEN}&redirect=/blog/draft`),
  ) as Response
  expect(res.status).toBe(307)
  expect(res.headers.get('location')).toBe('/blog/draft')
  return res.headers.getSetCookie()[0]!.split(';')[0]!
}

describe('createPreviewHandler', () => {
  it('sets a signed HttpOnly cookie for the right token', async () => {
    const res = await createPreviewHandler({ secret: SECRET, token: TOKEN })(
      ctxFor(`https://x.test/api/preview?token=${TOKEN}`),
    ) as Response
    const c = res.headers.getSetCookie()[0]!
    expect(c.startsWith(`${PREVIEW_COOKIE}=`)).toBe(true)
    expect(c).toMatch(/HttpOnly/)
    expect(c).toMatch(/Secure/)
  })

  it('rejects a wrong token with 401 and no cookie', async () => {
    const res = await createPreviewHandler({ secret: SECRET, token: TOKEN })(
      ctxFor('https://x.test/api/preview?token=nope'),
    ) as Response
    expect(res.status).toBe(401)
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('never open-redirects', async () => {
    for (const bad of ['https://evil.test', '//evil.test', '/\\evil.test']) {
      const res = await createPreviewHandler({ secret: SECRET, token: TOKEN })(
        ctxFor(`https://x.test/api/preview?token=${TOKEN}&redirect=${encodeURIComponent(bad)}`),
      ) as Response
      expect(res.headers.get('location')).toBe('/')
    }
  })

  it('exit clears the cookie; other paths pass through', async () => {
    const mw = createPreviewHandler({ secret: SECRET, token: TOKEN })
    const res = await mw(ctxFor('https://x.test/api/preview/exit')) as Response
    expect(res.headers.getSetCookie()[0]).toMatch(/Max-Age=0/)
    expect(await mw(ctxFor('https://x.test/other'))).toBeUndefined()
  })
})

describe('previewMiddleware + isPreview', () => {
  it('true only for a verified cookie', async () => {
    const good = ctxFor('https://x.test/', await enableCookie())
    await previewMiddleware({ secret: SECRET })(good)
    expect(isPreview(good)).toBe(true)
    expect(isPreview(good.req)).toBe(true)
    expect(isPreview({ request: good.req })).toBe(true)
    expect(good.headers.get('cache-control')).toBe('private, no-store')

    const forged = ctxFor('https://x.test/', `${PREVIEW_COOKIE}=forged.sig`)
    await previewMiddleware({ secret: SECRET })(forged)
    expect(isPreview(forged)).toBe(false)
    expect(forged.headers.get('cache-control')).toBeNull()
    expect(isPreview(undefined)).toBe(false)
  })
})

describe('createPreviewHandler — edge paths', () => {
  it('a missing token answers 401 (treated as the empty string, never a match)', async () => {
    const res = await createPreviewHandler({ secret: SECRET, token: TOKEN })(
      ctxFor('https://x.test/api/preview'),
    ) as Response
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('Invalid preview token')
  })

  it('a custom path (trailing slash stripped) and loopback http drop Secure', async () => {
    const mw = createPreviewHandler({ secret: SECRET, token: TOKEN, path: '/cms/preview/' })
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const res = await mw(ctxFor(`http://${host}:3000/cms/preview?token=${TOKEN}`)) as Response
      expect(res.status).toBe(307)
      expect(res.headers.getSetCookie()[0]).not.toMatch(/Secure/)
    }
    const exit = await mw(ctxFor('https://x.test/cms/preview/exit?redirect=/blog')) as Response
    expect(exit.headers.get('location')).toBe('/blog')
    expect(await mw(ctxFor(`https://x.test/api/preview?token=${TOKEN}`))).toBeUndefined()
  })
})

describe('previewMiddleware — no cookie, and isPreview source shapes', () => {
  it('a request with no preview cookie is untouched', async () => {
    const ctx = ctxFor('https://x.test/')
    await previewMiddleware({ secret: SECRET })(ctx)
    expect(isPreview(ctx)).toBe(false)
    expect(ctx.headers.get('cache-control')).toBeNull()
  })

  it('a loader context without a request is not in preview', () => {
    expect(isPreview({})).toBe(false)
    expect(isPreview({ request: undefined })).toBe(false)
  })
})

describe('preview × ISR — a preview visitor bypasses the cache and never populates it', () => {
  it('published page cached for the public; preview visitor gets a fresh draft render', async () => {
    let version = 'published-v1'
    const Page = () => h('p', null, `${useLoaderData<{ v: string }>()?.v}`)
    const routes: RouteRecord[] = [{
      path: '/',
      component: Page,
      loader: ({ request }) => ({ v: isPreview({ request }) ? 'DRAFT' : version }),
    }]
    const { App } = createApp({ routes, url: '/' })
    const handler = createHandler({ App, routes, middleware: [previewMiddleware({ secret: SECRET })] })
    const isr = createISRHandler(handler, { revalidate: 3600, cacheKey: (r) => new URL(r.url).pathname })

    const pub1 = await isr(new Request('https://x.test/'))
    expect(await pub1.text()).toContain('published-v1')
    expect(pub1.headers.get('x-isr-cache')).toBe('MISS')
    version = 'published-v2' // origin changed; cache still holds v1

    const prev = await isr(new Request('https://x.test/', { headers: { cookie: await enableCookie() } }))
    expect(await prev.text()).toContain('DRAFT')
    expect(prev.headers.get('x-isr-cache')).toBe('BYPASS')
    expect(prev.headers.get('cache-control')).toBe('private, no-store')

    // The public still gets the cached published page — the draft never entered the cache.
    const pub2 = await isr(new Request('https://x.test/'))
    const body = await pub2.text()
    expect(pub2.headers.get('x-isr-cache')).toBe('HIT')
    expect(body).toContain('published-v1')
    expect(body).not.toContain('DRAFT')
  })
})
