/**
 * `<NoOptimize>` subtree boundary tests.
 *
 * The third tier of the image opt-out grammar:
 *   1. Per-call `optimize={false}` (PR #1353)
 *   2. Subtree `<NoOptimize>...</NoOptimize>` (this PR)
 *   3. Global `zero({ image: false })` (PR #1356)
 *
 * The boundary writes a context value that `<Image>` reads. Inside the
 * boundary every `<Image>` renders as a bare `<img>`. Inner
 * `<NoOptimize disabled>` re-enables for that subtree. Per-call
 * `optimize={true}` is the explicit override that wins over a parent
 * boundary.
 *
 * SSR shape only (renderToString) — the runtime behavior is the same
 * shape covered by the bi-modal image tests; this file adds the
 * boundary-specific assertions.
 */
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { Image, NoOptimize } from '../index'
import type { ProcessedImage } from '../image-plugin'

function descriptor(): ProcessedImage {
  return {
    src: '/img/hero-1920.webp',
    srcset: '/img/hero-640.webp 640w, /img/hero-1920.webp 1920w',
    width: 1920,
    height: 1080,
    placeholder: '',
    formats: [],
    sources: [],
  }
}

describe('<NoOptimize> — subtree boundary', () => {
  it('drops every <Image> in the subtree to a bare <img> (no aspect-ratio wrapper)', async () => {
    const html = await renderToString(
      h(NoOptimize, null,
        h(Image, { src: descriptor(), alt: 'A' }),
        h(Image, { src: descriptor(), alt: 'B' }),
      ),
    )
    // Two bare <img>s, no wrapping <div> with `aspect-ratio:`.
    const imgs = html.match(/<img /g) ?? []
    expect(imgs.length).toBe(2)
    // No aspect-ratio container — the bypass path skips it.
    expect(html).not.toContain('aspect-ratio:')
    // alt + width + height come from the descriptor.
    expect(html).toContain('alt="A"')
    expect(html).toContain('alt="B"')
    expect(html).toContain('width="1920"')
    expect(html).toContain('height="1080"')
  })

  it('respects descriptor src in the bare <img>', async () => {
    const html = await renderToString(
      h(NoOptimize, null, h(Image, { src: descriptor(), alt: 'A' })),
    )
    expect(html).toContain('src="/img/hero-1920.webp"')
  })

  it('handles string-URL Image inside the boundary', async () => {
    const html = await renderToString(
      h(NoOptimize, null,
        h(Image, { src: 'https://cdn.example.com/x.png', alt: 'X', width: 64, height: 64 }),
      ),
    )
    expect(html).toContain('src="https://cdn.example.com/x.png"')
    expect(html).toContain('width="64"')
    expect(html).toContain('height="64"')
    // Bare img (no aspect-ratio wrapper).
    expect(html).not.toContain('aspect-ratio:')
  })

  it('does NOT affect <Image>s OUTSIDE the boundary', async () => {
    const html = await renderToString(
      h('div', null,
        h(NoOptimize, null, h(Image, { src: descriptor(), alt: 'inside' })),
        h(Image, { src: descriptor(), alt: 'outside' }),
      ),
    )
    // The "inside" image is bare; the "outside" image gets the
    // optimization wrapper with aspect-ratio.
    expect(html).toContain('aspect-ratio:')
    // Both images are present.
    expect(html).toContain('alt="inside"')
    expect(html).toContain('alt="outside"')
  })

  it('inner <NoOptimize disabled> re-enables optimization for its subtree', async () => {
    const html = await renderToString(
      h(NoOptimize, null,
        h(Image, { src: descriptor(), alt: 'bare-outer' }),
        h(NoOptimize, { disabled: true },
          h(Image, { src: descriptor(), alt: 'optimized-inner' }),
        ),
      ),
    )
    // The inner image gets the optimization wrapper (aspect-ratio).
    expect(html).toContain('aspect-ratio:')
    expect(html).toContain('alt="bare-outer"')
    expect(html).toContain('alt="optimized-inner"')
  })

  it('per-call optimize={true} overrides the parent boundary (caller wins)', async () => {
    const html = await renderToString(
      h(NoOptimize, null,
        h(Image, { src: descriptor(), alt: 'bare', optimize: false }),
        h(Image, { src: descriptor(), alt: 'forced', optimize: true }),
      ),
    )
    // Both images render. The forced one gets the optimization wrapper;
    // the explicit-bare one does not.
    expect(html).toContain('aspect-ratio:')
    expect(html).toContain('alt="bare"')
    expect(html).toContain('alt="forced"')
    // Count aspect-ratio containers: exactly one (the forced image).
    const containers = html.match(/aspect-ratio:/g) ?? []
    expect(containers.length).toBe(1)
  })

  it('without a NoOptimize boundary, <Image> behaves as before (full optimization)', async () => {
    const html = await renderToString(
      h(Image, { src: descriptor(), alt: 'plain' }),
    )
    expect(html).toContain('aspect-ratio:')
    expect(html).toContain('alt="plain"')
  })

  it('NoOptimize with no children renders empty (no error)', async () => {
    const html = await renderToString(h(NoOptimize, null))
    // Just an empty render; no exception.
    expect(html).toBe('')
  })
})
