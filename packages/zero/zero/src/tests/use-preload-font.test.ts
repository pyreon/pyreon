/**
 * `usePreloadFont` runtime preload primitive.
 *
 * Two layers:
 *   - `inferFontMimeType` — pure function mapping file extension to
 *     IANA-registry MIME type. Unit-testable in isolation.
 *   - `usePreloadFont` — emits a `<link rel="preload" as="font" type=…
 *     crossorigin>` via `useHead`. Verified end-to-end via
 *     `renderWithHead` in the integration tests below.
 *
 * Bisect-verifiable: the `as="font"` / `crossorigin` defaults are
 * load-bearing for the preload-scanner contract — removing them
 * silently breaks the preload (browser refuses to use the file for
 * `@font-face` without CORS; `as=font` without `type` is ignored).
 */
import { describe, expect, it } from 'vitest'
import { h, type VNode } from '@pyreon/core'
import { renderWithHead } from '@pyreon/head/ssr'
import { inferFontMimeType, usePreloadFont } from '../use-preload-font'

async function head(node: VNode): Promise<string> {
  const r = await renderWithHead(node)
  return r.head
}

describe('inferFontMimeType', () => {
  it('maps .woff2 to font/woff2', () => {
    expect(inferFontMimeType('/fonts/x.woff2')).toBe('font/woff2')
  })
  it('maps .woff to font/woff', () => {
    expect(inferFontMimeType('/fonts/x.woff')).toBe('font/woff')
  })
  it('maps .ttf to font/ttf', () => {
    expect(inferFontMimeType('/fonts/x.ttf')).toBe('font/ttf')
  })
  it('maps .otf to font/otf', () => {
    expect(inferFontMimeType('/fonts/x.otf')).toBe('font/otf')
  })
  it('maps .eot to the legacy IE MIME type', () => {
    expect(inferFontMimeType('/fonts/x.eot')).toBe('application/vnd.ms-fontobject')
  })
  it('is case-insensitive (.WOFF2 → font/woff2)', () => {
    expect(inferFontMimeType('/fonts/x.WOFF2')).toBe('font/woff2')
  })
  it('strips query strings before extension match', () => {
    expect(inferFontMimeType('/fonts/x.woff2?v=2')).toBe('font/woff2')
  })
  it('strips fragments before extension match', () => {
    expect(inferFontMimeType('/fonts/x.woff2#variant=bold')).toBe('font/woff2')
  })
  it('strips both query AND fragment', () => {
    expect(inferFontMimeType('/fonts/x.woff?v=2#bold')).toBe('font/woff')
  })
  it('handles CDN URLs', () => {
    expect(inferFontMimeType('https://cdn.example.com/brand.woff2')).toBe('font/woff2')
  })
  it('falls back to font/woff2 for unknown extension (silent ignore is worse than wrong type)', () => {
    expect(inferFontMimeType('/fonts/x.unknown')).toBe('font/woff2')
  })
})

function Probe(props: { href: string; type?: string; crossorigin?: 'anonymous' | 'use-credentials' }) {
  usePreloadFont(props.href, props)
  return null
}

describe('usePreloadFont — SSR head emission', () => {
  it('emits <link rel="preload" as="font"> for a basic .woff2 src', async () => {
    const out = await head(h(Probe, { href: '/fonts/inter.woff2' }))
    expect(out).toContain('rel="preload"')
    expect(out).toContain('as="font"')
    expect(out).toContain('href="/fonts/inter.woff2"')
  })

  it('emits type="font/woff2" by auto-infer (preload-scanner contract)', async () => {
    const out = await head(h(Probe, { href: '/fonts/inter.woff2' }))
    expect(out).toContain('type="font/woff2"')
  })

  it('emits crossorigin="anonymous" by default (CORS contract — without this fonts double-fetch)', async () => {
    const out = await head(h(Probe, { href: '/fonts/inter.woff2' }))
    expect(out).toContain('crossorigin="anonymous"')
  })

  it('honors explicit type override', async () => {
    const out = await head(
      h(Probe, { href: '/fonts/unknown-shape', type: 'font/woff2' }),
    )
    expect(out).toContain('type="font/woff2"')
  })

  it('honors explicit crossorigin="use-credentials"', async () => {
    const out = await head(
      h(Probe, { href: '/fonts/inter.woff2', crossorigin: 'use-credentials' }),
    )
    expect(out).toContain('crossorigin="use-credentials"')
    expect(out).not.toContain('crossorigin="anonymous"')
  })

  it('cross-origin font (CDN URL) STILL gets crossorigin (CSS Fonts CORS rule)', async () => {
    const out = await head(h(Probe, { href: 'https://cdn.example.com/brand.woff2' }))
    expect(out).toContain('crossorigin="anonymous"')
    expect(out).toContain('href="https://cdn.example.com/brand.woff2"')
  })

  it('dedups two usePreloadFont calls with the same href to ONE preload', async () => {
    const root = h('div', null, h(Probe, { href: '/fonts/inter.woff2' }), h(Probe, { href: '/fonts/inter.woff2' }))
    const out = await head(root)
    const matches = out.match(/href="\/fonts\/inter\.woff2"/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('two DIFFERENT hrefs emit TWO preloads', async () => {
    const root = h('div', null,
      h(Probe, { href: '/fonts/inter.woff2' }),
      h(Probe, { href: '/fonts/jetbrains.woff2' }),
    )
    const out = await head(root)
    expect(out).toContain('href="/fonts/inter.woff2"')
    expect(out).toContain('href="/fonts/jetbrains.woff2"')
  })
})
