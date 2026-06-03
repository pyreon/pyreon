import { describe, expect, it } from 'vitest'
import { isSafeImageDataUri, UNSAFE_URL_RE, URL_ATTRS } from '../url-guard'

// Canonical single-source matrix for the URL-attribute injection guard now
// shared by `@pyreon/runtime-dom` (client) and `@pyreon/runtime-server` (SSR).
// Each renderer keeps a thin behavior test of its own wiring; the exhaustive
// allow/block logic lives here so it can't drift between the two renderers.

describe('url-guard — URL_ATTRS / UNSAFE_URL_RE', () => {
  it('guards the URL-bearing attributes', () => {
    for (const a of ['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data']) {
      expect(URL_ATTRS.has(a)).toBe(true)
    }
    expect(URL_ATTRS.has('class')).toBe(false)
    expect(URL_ATTRS.has('alt')).toBe(false)
  })

  it('matches javascript:/data: prefixes (case-insensitive, leading whitespace)', () => {
    expect(UNSAFE_URL_RE.test('javascript:alert(1)')).toBe(true)
    expect(UNSAFE_URL_RE.test('  DATA:image/png;base64,x')).toBe(true)
    expect(UNSAFE_URL_RE.test('https://example.com')).toBe(false)
    expect(UNSAFE_URL_RE.test('/relative/path')).toBe(false)
  })
})

describe('url-guard — isSafeImageDataUri (allowed)', () => {
  // tagName is matched case-insensitively: DOM `Element.tagName` (uppercase,
  // runtime-dom) and raw JSX tag strings (lowercase, runtime-server) both work.
  it.each([
    ['IMG', 'img'],
    ['SOURCE', 'source'],
    ['VIDEO', 'video'],
  ])('raster data URI on image-context tag (%s / %s) passes', (upper, lower) => {
    const uri = 'data:image/webp;base64,UklGRvoAAABXRUJQVlA4'
    expect(isSafeImageDataUri(upper, 'src', uri)).toBe(true)
    expect(isSafeImageDataUri(lower, 'src', uri)).toBe(true)
  })

  it('every supported raster type passes', () => {
    for (const t of ['png', 'jpeg', 'jpg', 'gif', 'webp', 'avif', 'bmp']) {
      expect(isSafeImageDataUri('img', 'src', `data:image/${t};base64,abc`)).toBe(true)
    }
  })

  it('url-encoded svg with no script passes', () => {
    const uri = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3Crect/%3E%3C/svg%3E"
    expect(isSafeImageDataUri('img', 'src', uri)).toBe(true)
  })

  it('raw (un-encoded) svg with no script passes', () => {
    expect(isSafeImageDataUri('img', 'src', 'data:image/svg+xml,<svg><rect/></svg>')).toBe(true)
  })

  it('poster on <video> and srcset on <source> pass', () => {
    expect(isSafeImageDataUri('video', 'poster', 'data:image/png;base64,abc')).toBe(true)
    expect(isSafeImageDataUri('source', 'srcset', 'data:image/webp;base64,abc')).toBe(true)
  })
})

describe('url-guard — isSafeImageDataUri (blocked)', () => {
  it('svg carrying <script> is blocked', () => {
    expect(
      isSafeImageDataUri('img', 'src', 'data:image/svg+xml,<svg><script>x</script></svg>'),
    ).toBe(false)
  })

  it('svg carrying an on*= handler is blocked', () => {
    expect(isSafeImageDataUri('img', 'src', 'data:image/svg+xml,<svg onload=alert(1)></svg>')).toBe(
      false,
    )
  })

  it('base64 svg with onload is blocked (decoded + scanned)', () => {
    const uri = `data:image/svg+xml;base64,${btoa('<svg onload=alert(1)></svg>')}`
    expect(isSafeImageDataUri('img', 'src', uri)).toBe(false)
  })

  it('malformed svg with no payload comma is blocked', () => {
    expect(isSafeImageDataUri('img', 'src', 'data:image/svg+xml;base64')).toBe(false)
  })

  it('undecodable base64 svg is blocked', () => {
    expect(isSafeImageDataUri('img', 'src', 'data:image/svg+xml;base64,@@@not-base64@@@')).toBe(
      false,
    )
  })

  it('malformed %-escape svg falls back to a raw scan and blocks <script>', () => {
    expect(
      isSafeImageDataUri('img', 'src', 'data:image/svg+xml,<svg><script>x</script>%ZZ</svg>'),
    ).toBe(false)
  })

  it('data:image on a non-image-context element is blocked', () => {
    const uri = 'data:image/png;base64,abc'
    expect(isSafeImageDataUri('a', 'href', uri)).toBe(false)
    expect(isSafeImageDataUri('embed', 'src', uri)).toBe(false)
    expect(isSafeImageDataUri('iframe', 'src', uri)).toBe(false)
  })

  it('data:image on a non-image-source attribute is blocked', () => {
    const uri = 'data:image/png;base64,abc'
    expect(isSafeImageDataUri('img', 'href', uri)).toBe(false)
    expect(isSafeImageDataUri('video', 'data', uri)).toBe(false)
  })

  it('javascript: is never safe', () => {
    expect(isSafeImageDataUri('img', 'src', 'javascript:alert(1)')).toBe(false)
  })

  it('data:text/html is never safe', () => {
    expect(isSafeImageDataUri('img', 'src', 'data:text/html,<script>alert(1)</script>')).toBe(false)
  })
})
