import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { Image } from '../image'

// Caveat-1 coverage for the URL-guard fix (PR #1314 + the shared-`@pyreon/core`
// extraction). The imagePlugin ships blur (`data:image/webp;base64,…`) and
// color (`data:image/svg+xml,…`) placeholders that flow into `<Image>`'s
// placeholder `<img src={props.placeholder}>`. SSR/SSG MUST keep them in the
// static HTML — the URL guard used to strip ALL `data:` URIs server-side,
// shipping `<img>`/`<video>` with no `src`/`poster`.
//
// The per-renderer matrices (runtime-dom `coverage-gaps`, runtime-server `ssr`)
// test the raw `h('img')` guard path; THIS exercises the real `<Image>`
// component → `renderToString` pipeline — the exact end-to-end shape the bug
// broke — so a refactor that stops rendering the placeholder as an `<img src>`
// would be caught here.

describe('<Image> SSR — data:image placeholders survive the URL guard', () => {
  it('keeps a base64 webp blur placeholder in the rendered HTML', async () => {
    const placeholder = 'data:image/webp;base64,UklGRvoAAABXRUJQVlA4'
    const html = await renderToString(
      h(Image, { src: '/hero.jpg', placeholder, width: 1200, height: 630, alt: 'Hero' }),
    )
    expect(html).toContain(placeholder)
  })

  it('keeps a url-encoded svg color placeholder in the rendered HTML', async () => {
    const placeholder =
      "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3Crect%20fill='%23808080'/%3E%3C/svg%3E"
    const html = await renderToString(
      h(Image, { src: '/hero.jpg', placeholder, width: 800, height: 600, alt: 'Hero' }),
    )
    expect(html).toContain('data:image/svg+xml')
  })

  it('raw-mode <Image> keeps a data:image src', async () => {
    const src =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const html = await renderToString(h(Image, { src, raw: true, width: 1, height: 1, alt: 'px' }))
    expect(html).toContain(src)
  })
})
