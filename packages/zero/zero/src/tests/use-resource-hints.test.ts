/**
 * Resource-hint primitive tests.
 *
 * Three documented hooks:
 *   - usePreconnect — full connection (DNS + TCP + TLS)
 *   - useDnsPrefetch — DNS only (cheaper, weaker)
 *   - usePreload — strong fetch hint for a specific resource
 *
 * Each wraps useHead with the correct defaults + dedup behavior.
 * Bisect-verified at the default-value layer.
 */
import { describe, expect, it } from 'vitest'
import { h, type VNode } from '@pyreon/core'
import { renderWithHead } from '@pyreon/head/ssr'
import { useDnsPrefetch, usePreconnect, usePreload } from '../use-resource-hints'

async function head(node: VNode): Promise<string> {
  const r = await renderWithHead(node)
  return r.head
}

// Dedicated probe components per-hook (TS-friendly).
function PreconnectProbe(props: { origin: string; credentials?: boolean }): null {
  usePreconnect(props.origin, props.credentials !== undefined ? { credentials: props.credentials } : undefined)
  return null
}

function DnsPrefetchProbe(props: { origin: string }): null {
  useDnsPrefetch(props.origin)
  return null
}

function PreloadProbe(props: {
  href: string
  as: 'script' | 'style' | 'image' | 'font' | 'fetch'
  type?: string
  crossorigin?: 'anonymous' | 'use-credentials'
  imagesrcset?: string
  imagesizes?: string
  fetchpriority?: 'high' | 'low' | 'auto'
  media?: string
}): null {
  const { href, ...opts } = props
  usePreload(href, opts)
  return null
}

describe('usePreconnect', () => {
  it('emits rel="preconnect" + href + crossorigin="anonymous" by default', async () => {
    const out = await head(h(PreconnectProbe, { origin: 'https://fonts.gstatic.com' }))
    expect(out).toContain('rel="preconnect"')
    expect(out).toContain('href="https://fonts.gstatic.com"')
    expect(out).toContain('crossorigin="anonymous"')
  })

  it('credentials:true → crossorigin="use-credentials"', async () => {
    const out = await head(
      h(PreconnectProbe, { origin: 'https://api.example.com', credentials: true }),
    )
    expect(out).toContain('crossorigin="use-credentials"')
    expect(out).not.toContain('crossorigin="anonymous"')
  })

  it('dedup: two same-origin preconnects emit ONE tag', async () => {
    const root = h('div', null,
      h(PreconnectProbe, { origin: 'https://cdn.example.com' }),
      h(PreconnectProbe, { origin: 'https://cdn.example.com' }),
    )
    const out = await head(root)
    const matches = out.match(/href="https:\/\/cdn\.example\.com"/g) ?? []
    expect(matches.length).toBe(1)
  })
})

describe('useDnsPrefetch', () => {
  it('emits rel="dns-prefetch" + href', async () => {
    const out = await head(h(DnsPrefetchProbe, { origin: 'https://analytics.example.com' }))
    expect(out).toContain('rel="dns-prefetch"')
    expect(out).toContain('href="https://analytics.example.com"')
  })

  it('does NOT emit crossorigin (DNS resolution is scheme-agnostic)', async () => {
    const out = await head(h(DnsPrefetchProbe, { origin: 'https://x.example.com' }))
    expect(out).not.toContain('crossorigin')
  })

  it('dedup: two same-origin dns-prefetches emit ONE tag', async () => {
    const root = h('div', null,
      h(DnsPrefetchProbe, { origin: 'https://x.example.com' }),
      h(DnsPrefetchProbe, { origin: 'https://x.example.com' }),
    )
    const out = await head(root)
    const matches = out.match(/href="https:\/\/x\.example\.com"/g) ?? []
    expect(matches.length).toBe(1)
  })
})

describe('usePreload', () => {
  it('emits rel="preload" + as + href for a basic image', async () => {
    const out = await head(h(PreloadProbe, { href: '/hero.jpg', as: 'image' }))
    expect(out).toContain('rel="preload"')
    expect(out).toContain('as="image"')
    expect(out).toContain('href="/hero.jpg"')
  })

  it('emits type when supplied (required for as=font)', async () => {
    const out = await head(h(PreloadProbe, {
      href: '/x.woff2',
      as: 'font',
      type: 'font/woff2',
      crossorigin: 'anonymous',
    }))
    expect(out).toContain('type="font/woff2"')
    expect(out).toContain('crossorigin="anonymous"')
  })

  it('emits imagesrcset + imagesizes for responsive image preload', async () => {
    const out = await head(h(PreloadProbe, {
      href: '/hero.jpg',
      as: 'image',
      imagesrcset: '/hero-640.jpg 640w, /hero-1920.jpg 1920w',
      imagesizes: '100vw',
    }))
    expect(out).toContain('imagesrcset="/hero-640.jpg 640w, /hero-1920.jpg 1920w"')
    expect(out).toContain('imagesizes="100vw"')
  })

  it('emits fetchpriority when supplied', async () => {
    const out = await head(h(PreloadProbe, {
      href: '/x.js',
      as: 'script',
      fetchpriority: 'high',
    }))
    expect(out).toContain('fetchpriority="high"')
  })

  it('emits media when supplied (mobile-only preload)', async () => {
    const out = await head(h(PreloadProbe, {
      href: '/mobile.css',
      as: 'style',
      media: '(max-width: 600px)',
    }))
    expect(out).toContain('media="(max-width: 600px)"')
  })

  it('does NOT emit attrs that were not supplied', async () => {
    const out = await head(h(PreloadProbe, { href: '/x.png', as: 'image' }))
    expect(out).not.toContain('type=')
    expect(out).not.toContain('crossorigin=')
    expect(out).not.toContain('imagesrcset=')
    expect(out).not.toContain('imagesizes=')
    expect(out).not.toContain('fetchpriority=')
    expect(out).not.toContain('media=')
  })

  it('dedup: two same-href preloads emit ONE tag', async () => {
    const root = h('div', null,
      h(PreloadProbe, { href: '/hero.jpg', as: 'image' }),
      h(PreloadProbe, { href: '/hero.jpg', as: 'image' }),
    )
    const out = await head(root)
    const matches = out.match(/href="\/hero\.jpg"/g) ?? []
    expect(matches.length).toBe(1)
  })
})

describe('cross-hint composition', () => {
  it('preconnect + dns-prefetch + preload emit three distinct link tags', async () => {
    function Combined(): null {
      usePreconnect('https://fonts.gstatic.com')
      useDnsPrefetch('https://analytics.example.com')
      usePreload('/hero.jpg', { as: 'image' })
      return null
    }
    const out = await head(h(Combined, null))
    expect(out).toContain('rel="preconnect"')
    expect(out).toContain('rel="dns-prefetch"')
    expect(out).toContain('rel="preload"')
    expect(out).toContain('href="https://fonts.gstatic.com"')
    expect(out).toContain('href="https://analytics.example.com"')
    expect(out).toContain('href="/hero.jpg"')
  })
})
