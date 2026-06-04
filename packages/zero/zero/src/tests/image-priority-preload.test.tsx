/**
 * `<Image priority>` preload — SSR head-extraction tests (issue #1351).
 *
 * The `priority` prop's job is to make the LCP image discoverable to the
 * browser's preload scanner BEFORE it parses to the body's `<img>` tag.
 * The body-side `fetchpriority="high"` was already wired; this test gate
 * locks the head-side `<link rel="preload" as="image">` half.
 *
 * Gates (deterministic, not Lighthouse-dependent):
 *   - priority + srcset → head contains preload link with imagesrcset + imagesizes
 *   - priority + cross-origin src → preload carries crossorigin="anonymous"
 *   - priority same-origin → NO crossorigin (omitted)
 *   - non-priority image → NO preload in head (the negative — catches over-emission)
 *   - two priority images with same src → ONE preload (dedup)
 *   - priority WITHOUT srcset and WITHOUT formats → NO preload (browser can preload
 *     the static <img src> via fetchpriority alone in that case)
 */
import { describe, expect, it } from 'vitest'
import { h, type VNode } from '@pyreon/core'
import { renderWithHead } from '@pyreon/head/ssr'
import { Image } from '../image'
import type { ProcessedImage } from '../image-plugin'

function descriptor(overrides: Partial<ProcessedImage> = {}): ProcessedImage {
  return {
    src: '/img/hero-1920.webp',
    srcset: '/img/hero-640.webp 640w, /img/hero-1920.webp 1920w',
    width: 1920,
    height: 1080,
    placeholder: 'data:image/svg+xml,...',
    formats: [],
    sources: [],
    ...overrides,
  }
}

async function head(node: VNode): Promise<string> {
  const r = await renderWithHead(node)
  return r.head
}

describe('<Image priority> — SSR head preload', () => {
  it('emits <link rel="preload" as="image"> with imagesrcset + imagesizes for a descriptor', async () => {
    const out = await head(h(Image, { src: descriptor(), alt: 'Hero', priority: true }))
    expect(out).toContain('rel="preload"')
    expect(out).toContain('as="image"')
    expect(out).toContain('fetchpriority="high"')
    expect(out).toContain('imagesrcset="/img/hero-640.webp 640w, /img/hero-1920.webp 1920w"')
    expect(out).toContain('imagesizes="100vw"')
  })

  it('omits crossorigin for same-origin (rooted-path) srcs', async () => {
    const out = await head(h(Image, { src: descriptor(), alt: 'Hero', priority: true }))
    expect(out).not.toMatch(/crossorigin/i)
  })

  it('adds crossorigin="anonymous" for cross-origin string-URL srcs', async () => {
    const out = await head(
      h(Image, {
        src: 'https://cdn.example.com/hero.jpg',
        alt: 'Hero',
        width: 1200,
        height: 630,
        srcset: 'https://cdn.example.com/hero-640.jpg 640w, https://cdn.example.com/hero-1200.jpg 1200w',
        priority: true,
      }),
    )
    expect(out).toContain('rel="preload"')
    expect(out).toContain('crossorigin="anonymous"')
  })

  it('emits NO preload for a non-priority image (the negative)', async () => {
    const out = await head(h(Image, { src: descriptor(), alt: 'Below fold' }))
    expect(out).not.toMatch(/rel="preload"/)
    expect(out).not.toMatch(/as="image"/)
  })

  it('emits NO preload when priority is set but neither srcset NOR formats are present', async () => {
    // Without responsive sources, the browser can preload the static <img>
    // via fetchpriority="high" alone — emitting a bare-href preload buys
    // nothing and risks a double-fetch on cross-origin URLs.
    const out = await head(
      h(Image, {
        src: 'https://cdn.example.com/avatar.png',
        alt: 'Avatar',
        width: 64,
        height: 64,
        priority: true,
      }),
    )
    expect(out).not.toMatch(/rel="preload"/)
  })

  it('two priority <Image>s with the same src dedup to ONE preload', async () => {
    const desc = descriptor()
    const root = h('div', null,
      h(Image, { src: desc, alt: 'A', priority: true }),
      h(Image, { src: desc, alt: 'B', priority: true }),
    )
    const out = await head(root)
    const matches = out.match(/rel="preload"/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('descriptor with formats: preload uses the FALLBACK srcset, not the AVIF/WebP one', async () => {
    // Per issue #1351 subtlety: the body's <img> carries only the fallback
    // srcset (best-format goes on <source>). Preloading the AVIF/WebP
    // srcset would diverge from what <picture> actually selects. The
    // descriptor's `srcset` field IS the fallback (image-plugin rebuilds
    // it to the last format), so the preload reads from it directly.
    const desc = descriptor({
      formats: [
        { type: 'image/avif', srcset: '/img/hero-640.avif 640w, /img/hero-1920.avif 1920w' },
        { type: 'image/webp', srcset: '/img/hero-640.webp 640w, /img/hero-1920.webp 1920w' },
      ],
      srcset: '/img/hero-640.jpg 640w, /img/hero-1920.jpg 1920w', // FALLBACK
      src: '/img/hero-1920.jpg',
    })
    const out = await head(h(Image, { src: desc, alt: 'Hero', priority: true }))
    expect(out).toContain('imagesrcset="/img/hero-640.jpg 640w, /img/hero-1920.jpg 1920w"')
    expect(out).not.toContain('.avif')
    expect(out).not.toContain('.webp')
  })
})
