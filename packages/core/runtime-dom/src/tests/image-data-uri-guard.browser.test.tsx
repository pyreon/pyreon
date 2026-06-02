/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium regression for the setStaticProp URL guard blocking ALL
 * `data:` URIs on `src`, which silently disabled <OptimizedImage>/<Image>
 * blur+color placeholders — the framework's own imagePlugin ships
 * `data:image/webp;base64,…` (blur) and `data:image/svg+xml,…` (color).
 *
 * These exercise the END-TO-END reactive-prop path (`<img src={accessor}>`,
 * the exact shape <Image>'s placeholder mounts as) through the real mount
 * pipeline + a real browser — not just direct applyProp. The unit matrix in
 * coverage-gaps.test.ts covers the guard's allow/block decisions; this proves
 * the data URI survives the compiler-shaped reactive binding into the DOM.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

const BLUR = 'data:image/webp;base64,UklGRvoAAABXRUJQVlA4'

describe('image data: URI guard (real browser, reactive prop path)', () => {
  it('reactive <img src={accessor}> with a data:image/webp placeholder reaches the DOM', () => {
    const src = signal(BLUR)
    const { container } = mountInBrowser(h('img', { src: () => src(), 'data-testid': 'ph' }))
    const img = container.querySelector<HTMLImageElement>('[data-testid="ph"]')!
    expect(img.getAttribute('src')).toBe(BLUR)
  })

  it('swapping the accessor from placeholder data URI to the real URL patches src in place', async () => {
    const src = signal(BLUR)
    const { container } = mountInBrowser(h('img', { src: () => src(), 'data-testid': 'swap' }))
    const img = container.querySelector<HTMLImageElement>('[data-testid="swap"]')!
    expect(img.getAttribute('src')).toBe(BLUR)
    src.set('/images/hero.webp')
    await flush()
    expect(img.getAttribute('src')).toBe('/images/hero.webp')
  })

  it('data:text/html on a reactive <iframe src> stays blocked', () => {
    const src = signal('data:text/html,<script>alert(1)</script>')
    const { container } = mountInBrowser(h('iframe', { src: () => src(), 'data-testid': 'xss' }))
    const frame = container.querySelector<HTMLIFrameElement>('[data-testid="xss"]')!
    expect(frame.getAttribute('src')).toBeNull()
  })
})
