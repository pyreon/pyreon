import { describe, expect, it } from 'vitest'
import { isSafeImageDataUri, isUnsafeUrl, UNSAFE_URL_RE, URL_ATTRS } from '../url-guard'

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

describe('url-guard — isUnsafeUrl (charCodeAt fast path)', () => {
  // `isUnsafeUrl` MUST be behaviorally identical to `UNSAFE_URL_RE.test` — it
  // just adds a first-char fast path. This exhaustive matrix (incl. unicode
  // whitespace, which `\s` matches and a naive `c > 32` fast path would MISS)
  // is the equivalence gate; a divergence is a security hole or a false block.
  const cases: string[] = [
    // must BLOCK (unsafe)
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'jAvAsCrIpT:x',
    ' javascript:x',
    '   javascript:x',
    '\tjavascript:x',
    '\njavascript:x',
    '\r\njavascript:x',
    '\fjavascript:x',
    '\u000bjavascript:x', // vertical tab
    'data:text/html,<script>',
    'DATA:text/html,x',
    ' data:text/html,x',
    '\tdata:text/html,x',
    // unicode-whitespace-prefixed (the `\s` set — a `c > 32` fast path would
    // wrongly pass these; the conservative predicate routes ≥127 to the regex)
    '\u00a0javascript:x', // NBSP (160)
    '\u2028data:text/html,x', // line separator
    '\u2029javascript:x', // paragraph separator
    '\u3000data:text/html,x', // ideographic space
    '\ufeffjavascript:x', // BOM
    '\u1680javascript:x', // ogham space mark
    '\u205fdata:x', // medium math space
    // must ALLOW (safe) — first char hits the fast path
    'https://example.com',
    'http://example.com',
    '/relative/path',
    './rel',
    '../rel',
    '#anchor',
    '?a=1&b=2',
    'mailto:a@b.com',
    'tel:+123',
    'ftp://host',
    'data', // no colon — not a scheme
    'javascriptx', // no colon
    'javascript', // no colon
    'javascript ', // no colon
    'HTTP://X',
    'Data', // no colon
    '',
    ' ', // single space, no scheme → safe
    'x',
    'D', // bare 'D', no colon → safe (falls to regex, no match)
    'j', // bare 'j', no colon → safe
    'data-uri-ish/path', // starts with 'd' → regex, no `data:` → safe
    'javascriptural/thing', // starts with 'j' → regex, no `javascript:` → safe
  ]

  it('is byte-for-byte equivalent to UNSAFE_URL_RE.test on the full matrix', () => {
    for (const url of cases) {
      expect(isUnsafeUrl(url)).toBe(UNSAFE_URL_RE.test(url))
    }
  })

  it('BLOCKS every javascript:/data: variant (security invariant)', () => {
    for (const url of cases) {
      const lower = url.trimStart().toLowerCase()
      if (lower.startsWith('javascript:') || lower.startsWith('data:')) {
        expect(isUnsafeUrl(url)).toBe(true)
      }
    }
    // and the unicode-whitespace ones explicitly (the `.trimStart()` above uses
    // JS whitespace which matches `\s`, but be explicit for the security bar):
    expect(isUnsafeUrl('\u00a0javascript:x')).toBe(true)
    expect(isUnsafeUrl('\ufeffdata:text/html,x')).toBe(true)
    expect(isUnsafeUrl('\u3000javascript:x')).toBe(true)
  })

  it('ALLOWS common safe URLs via the fast path (no false blocks)', () => {
    for (const url of ['https://x', '/a', './a', '#a', '?a=1', 'mailto:x', 'tel:1', '']) {
      expect(isUnsafeUrl(url)).toBe(false)
    }
  })

  it('random-string fuzz stays equivalent to the regex', () => {
    const chars =
      'jJdDaAtScRiPvhttp:/.#? \t\n\u00a0\u2028\ufeff-_012xyz'.split('')
    let a = 1234567
    const rnd = () => {
      a = (a * 1103515245 + 12345) & 0x7fffffff
      return a / 0x7fffffff
    }
    for (let i = 0; i < 5000; i++) {
      const len = Math.floor(rnd() * 14)
      let s = ''
      for (let k = 0; k < len; k++) s += chars[Math.floor(rnd() * chars.length)]
      expect(isUnsafeUrl(s)).toBe(UNSAFE_URL_RE.test(s))
    }
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
