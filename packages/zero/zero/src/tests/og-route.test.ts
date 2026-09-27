import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { describe, expect, it, vi } from 'vitest'
import {
  absoluteOgUrl,
  injectOgMeta,
  ogEndpointPath,
  ogMetaTags,
  pagePathFromOgEndpoint,
  renderOgSvgFromLoaded,
} from '../og-route'

const Page = () => h('p', null, 'x')

function routesWith(og: unknown): RouteRecord[] {
  return [{ path: '/a/:id', component: Page, og: async () => og } as unknown as RouteRecord]
}

describe('og endpoint paths', () => {
  it('round-trips page paths', () => {
    for (const p of ['/', '/about', '/posts/hello']) {
      expect(pagePathFromOgEndpoint(ogEndpointPath(p))).toBe(p)
    }
    expect(ogEndpointPath('/posts/x/?q=1')).toBe('/_zero/og/posts/x.png')
  })
  it('rejects non-og and traversal URLs', () => {
    expect(pagePathFromOgEndpoint('/_zero/og/../secret.png')).toBeNull()
    expect(pagePathFromOgEndpoint('/_zero/og/a.jpg')).toBeNull()
    expect(pagePathFromOgEndpoint('/other/a.png')).toBeNull()
  })
})

describe('meta injection', () => {
  const tags = ogMetaTags('https://x.test/a.png', 1200, 630)
  it('inserts before </head>', () => {
    expect(injectOgMeta('<html><head></head></html>', tags)).toBe(`<html><head>${tags}</head></html>`)
  })
  it('an explicit og:image (useHead) wins', () => {
    const html = '<head><meta property="og:image" content="/mine.png"></head>'
    expect(injectOgMeta(html, tags)).toBe(html)
  })
  it('escapes the URL attribute', () => {
    expect(ogMetaTags('/a".png', 1, 1)).toContain('content="/a&quot;.png"')
  })
  it('absolute URL from siteUrl', () => {
    expect(absoluteOgUrl('/assets/og/a.png', 'https://s.test/ignored/')).toBe('https://s.test/assets/og/a.png')
    expect(absoluteOgUrl('/assets/og/a.png', undefined)).toBe('/assets/og/a.png')
  })
})

describe('renderOgSvgFromLoaded', () => {
  it('renders params + data and adds the SVG namespace', async () => {
    const og = ({ params, data }: { params: { id: string }; data: { t: string } }) =>
      h('svg', { width: 10, height: 10 }, h('text', null, `${params.id}:${data.t}`))
    const routes = routesWith(og)
    const svg = await renderOgSvgFromLoaded(routes, '/a/7', new Map([[routes[0]!, { t: 'T' }]]))
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
    expect(svg).toContain('7:T')
  })
  it('returns null when the route has no og', async () => {
    const routes = [{ path: '/b', component: Page } as RouteRecord]
    expect(await renderOgSvgFromLoaded(routes, '/b', new Map())).toBeNull()
  })
  it('a non-<svg> root throws an actionable [Pyreon] error', async () => {
    await expect(renderOgSvgFromLoaded(routesWith(() => h('div', null)), '/a/1', new Map())).rejects.toThrow(
      /\[Pyreon\].*<svg> root/,
    )
  })
  it('a non-function og export throws', async () => {
    await expect(renderOgSvgFromLoaded(routesWith({}), '/a/1', new Map())).rejects.toThrow(/component function/)
  })
})

describe('rasterizeOgSvg without sharp', () => {
  it('throws a [Pyreon] install hint', async () => {
    vi.resetModules()
    vi.doMock('sharp', () => {
      throw new Error('Cannot find module sharp')
    })
    const { rasterizeOgSvg } = await import('../og-route-shared')
    await expect(rasterizeOgSvg('<svg/>', 1, 1)).rejects.toThrow(/\[Pyreon\].*sharp.*bun add -D sharp/)
    vi.doUnmock('sharp')
  })
})
