import { describe, expect, it } from 'vitest'
import { trimStaticPage } from '../../../vite-plugins/static-pages'
import sitemap from '../content/_sitemap.json'
import { HOME } from '../content/home'
import { pageHeadTags } from '../head'
import { asset, fallbackVariant, mediaUrl, pictureOf, shareImage, sourceSets, themePair } from '../kit/assets'
import { C } from '../kit/classes'
import { pickLoopFiles } from '../kit/LoopPlayer'
import { SITE_CSS } from '../kit/site-css'
import { commandSteps, lastPhrase } from '../pages/home/HomePage'
import { STATIC_MARKER } from '../render-mode'

const ROUTES = (sitemap as { sections: { pages: { route: string }[] }[] }).sections.flatMap((s) => s.pages.map((p) => p.route))

describe('head helper', () => {
  it('writes canonical, Open Graph and Twitter tags with the route share image', () => {
    const t = pageHeadTags({ path: '/', title: 'T', description: 'D' })
    const meta = (k: string) => t.meta.find((m) => m.property === k || m.name === k)?.content
    expect(t.title).toBe('T')
    expect(t.link).toEqual([{ rel: 'canonical', href: 'https://pyreon.dev/' }])
    expect(meta('og:url')).toBe('https://pyreon.dev/')
    expect(meta('og:image')).toBe('https://pyreon.dev/media/og/home.png')
    expect(meta('twitter:card')).toBe('summary_large_image')
    expect(meta('twitter:image')).toBe(meta('og:image'))
    expect(meta('og:image:alt')).toBe(asset('og/home.png').alt)
    expect(meta('robots')).toBeUndefined()
  })
  it('falls back to the site share card, drops a trailing slash, and marks noindex', () => {
    const t = pageHeadTags({ path: '/not-a-page/', title: 'T', description: 'D', noindex: true })
    expect(t.link[0]?.href).toBe('https://pyreon.dev/not-a-page')
    expect(t.meta.find((m) => m.property === 'og:image')?.content).toBe('https://pyreon.dev/media/og/default.png')
    expect(t.meta.find((m) => m.name === 'robots')?.content).toBe('noindex')
  })
})

describe('asset helpers', () => {
  it('serves media under /media and brand icons under /brand', () => {
    expect(mediaUrl('home/x.webp')).toBe('/media/home/x.webp')
    expect(mediaUrl('brand/favicon.svg')).toBe('/brand/favicon.svg')
    expect(mediaUrl('brand/logo-pack/x.png')).toBe('/media/brand/logo-pack/x.png')
  })
  it('lists AVIF before WebP, widths ascending, and falls back to the widest WebP', () => {
    const v = [
      { file: 'a-1280.webp', width: 1280, height: 1, format: 'webp' },
      { file: 'a-640.avif', width: 640, height: 1, format: 'avif' },
      { file: 'a-640.webp', width: 640, height: 1, format: 'webp' },
    ]
    expect(sourceSets(v)).toEqual([
      { type: 'image/avif', srcset: '/media/a-640.avif 640w' },
      { type: 'image/webp', srcset: '/media/a-640.webp 640w, /media/a-1280.webp 1280w' },
    ])
    expect(fallbackVariant(v)?.file).toBe('a-1280.webp')
  })
  it('gives a picture its intrinsic size and alt from the manifest', () => {
    const p = pictureOf('showcase/app-dashboard.png')
    expect(p.width).toBeGreaterThan(0)
    expect(p.height).toBeGreaterThan(0)
    expect(p.alt).toBe(asset('showcase/app-dashboard.png').alt)
    expect(p.src).toMatch(/^\/media\/showcase\/.+\.webp$/)
  })
  it('resolves a theme pair from either side', () => {
    const pair = themePair('video/three-targets-dark.poster.png')
    expect(pair).toEqual({ dark: 'video/three-targets-dark.poster.png', light: 'video/three-targets-light.poster.png' })
    expect(themePair('video/three-targets-light.poster.png')).toEqual(pair)
  })
  it('throws with the fix for a file that was not synced', () => {
    expect(() => asset('nope.png')).toThrow(/sync-site-assets/)
  })
  it('every share image the head can pick exists', () => {
    expect(shareImage('/').url).toMatch(/og\/home\.png$/)
    expect(shareImage('/missing').url).toMatch(/og\/default\.png$/)
  })
})

describe('loop files', () => {
  const sources = {
    dark: { webm: 'd.webm', mp4: 'd.mp4', smallWebm: 'ds.webm', smallMp4: 'ds.mp4' },
    light: { webm: 'l.webm', mp4: 'l.mp4' },
  }
  it('follows the theme and the screen, falling back to the large file', () => {
    expect(pickLoopFiles(sources, 'dark', false)).toEqual({ webm: 'd.webm', mp4: 'd.mp4' })
    expect(pickLoopFiles(sources, 'dark', true)).toEqual({ webm: 'ds.webm', mp4: 'ds.mp4' })
    expect(pickLoopFiles(sources, 'light', true)).toEqual({ webm: 'l.webm', mp4: 'l.mp4' })
  })
})

describe('static pages', () => {
  const page = (body: string) =>
    `<html><head><link rel="modulepreload" href="/assets/index-a.js"><link rel="modulepreload" href="/assets/kit-b.js"></head><body><main ${body}></main><script>window.__PYREON_LOADER_DATA__={"x":1}</script></body></html>`
  it('keeps only the entry graph preloads and drops loader data on a marked page', () => {
    const out = trimStaticPage(page(STATIC_MARKER), new Set(['/assets/index-a.js']))
    expect(out).toContain('/assets/index-a.js')
    expect(out).not.toContain('/assets/kit-b.js')
    expect(out).not.toContain('__PYREON_LOADER_DATA__')
  })
  it('leaves a docs page alone', () => {
    const html = page('id="docs"')
    expect(trimStaticPage(html, new Set())).toBe(html)
  })
})

describe('the islands stylesheet', () => {
  it.each(Object.entries(C))('styles .%s', (_key, cls) => {
    expect(SITE_CSS).toContain(`.${cls}`)
  })
  it('sits in its own cascade layer', () => {
    expect(SITE_CSS.startsWith('@layer site{')).toBe(true)
  })
})

describe('homepage content', () => {
  it('has every section kind once, hero first and the call to action last', () => {
    const kinds = HOME.sections.map((s) => s.kind)
    expect(kinds[0]).toBe('hero')
    expect(kinds.at(-1)).toBe('cta')
    expect(new Set(kinds).size).toBe(kinds.length)
  })
  it('links only to routes the integrated site has (or outside it)', () => {
    const hrefs = JSON.stringify(HOME).match(/"href":"[^"]+"/g) ?? []
    const known = (href: string) => {
      const path = href.split('#')[0] ?? href
      if (!path.startsWith('/')) return true
      if (path.startsWith('/docs')) return true
      return ROUTES.includes(path)
    }
    const unknown = hrefs.map((h) => h.slice(8, -1)).filter((h) => !known(h))
    expect(unknown).toEqual([])
  })
  it('splits the reproduce command into steps and finds the closing phrase', () => {
    expect(commandSteps('a && b\nc')).toEqual(['a', 'b', 'c'])
    expect(lastPhrase('Start building in one line.')).toBe('one line.')
  })
})
