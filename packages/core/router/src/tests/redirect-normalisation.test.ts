import { describe, expect, it } from 'vitest'
import { classifyRedirectTarget, safeRedirectLocation } from '../redirect'

/**
 * `safeRedirectLocation` exists so a target that may have come from user input
 * — the canonical `?next=` shape — cannot send a visitor off-origin or run a
 * `javascript:` URL. It classified the RAW string, while a browser classifies a
 * PREPROCESSED one, so a single character defeated it.
 *
 * The WHATWG URL parser does two things before anything else looks at a scheme:
 * it strips leading/trailing C0 controls and space, and it removes ALL ASCII
 * tab and newline from anywhere in the input. `String.prototype.trim()` covers
 * the first only partially (Unicode whitespace plus five of the C0 controls)
 * and the second not at all, because that character sits in the middle.
 *
 * The ORACLE here is the platform's own URL parser, not a table of expected
 * strings: the claim is "what we hand back cannot resolve off-origin", and only
 * the parser can answer that. A hand-written table would encode this file's
 * assumptions about parsing, which is the thing that was wrong.
 */
const TAB = String.fromCharCode(9)
const LF = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const NUL = String.fromCharCode(0)
const SOH = String.fromCharCode(1)

const BASE = 'https://app.example'

/** Where a browser would actually land, given what the guard returned. */
function landsAt(target: string): string {
  return new URL(safeRedirectLocation(target), BASE).href
}

describe('classifyRedirectTarget — URL-parser preprocessing', () => {
  describe('ASCII tab / newline removed from ANYWHERE (the interior case)', () => {
    // `trim()` cannot reach these: the character is in the middle.
    const interior: [string, string][] = [
      ['tab inside a protocol-relative URL', `/${TAB}/evil.example`],
      ['LF inside a protocol-relative URL', `/${LF}/evil.example`],
      ['CR inside a protocol-relative URL', `/${CR}/evil.example`],
      ['tab inside the scheme', `java${TAB}script:alert(1)`],
      ['LF inside the scheme', `java${LF}script:alert(1)`],
    ]

    it.each(interior)('%s is blocked', (_label, target) => {
      expect(classifyRedirectTarget(target).kind).toBe('block')
      expect(landsAt(target)).toBe(`${BASE}/`)
    })
  })

  describe('leading C0 controls stripped (beyond what trim() removes)', () => {
    // trim() removes tab/LF/VT/FF/CR and Unicode whitespace — NOT NUL, and not
    // the other C0 controls. The URL parser removes all of them.
    const leading: [string, string][] = [
      ['NUL before a protocol-relative URL', `${NUL}//evil.example`],
      ['SOH before a protocol-relative URL', `${SOH}//evil.example`],
      ['NUL before a javascript: URL', `${NUL}javascript:alert(1)`],
      ['SOH before a javascript: URL', `${SOH}javascript:alert(1)`],
    ]

    it.each(leading)('%s is blocked', (_label, target) => {
      expect(classifyRedirectTarget(target).kind).toBe('block')
      expect(landsAt(target)).toBe(`${BASE}/`)
    })
  })

  it('never returns something that resolves off-origin or to a script URL', () => {
    // One assertion over the whole corpus: whatever the classification, the
    // returned string must not be able to leave the origin.
    const hostile = [
      '//evil.example',
      ` ${NUL}//evil.example`,
      `/${TAB}/evil.example`,
      `java${LF}script:alert(1)`,
      `${SOH}javascript:alert(1)`,
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ]
    for (const target of hostile) {
      const href = landsAt(target)
      expect(new URL(href).origin, `target ${JSON.stringify(target)} escaped`).toBe(BASE)
    }
  })

  it('resolves a SAFE target exactly where the browser would resolve the original', () => {
    // The normalisation must be a no-op with respect to the final URL: it may
    // only change the string we hand over, never where that string points. This
    // is the invariant that says the fix is a fix and not a behaviour change —
    // including for an encoded `%09`, which the parser does NOT strip.
    const benign = [
      '/ok',
      '  /ok?a=1',
      `/search?q=a${TAB}b`,
      '/search?q=a%09b',
      '/path/with space',
      '/a?b=1&c=2#frag',
      'https://ok.example/x',
    ]
    for (const target of benign) {
      expect(landsAt(target), `target ${JSON.stringify(target)} moved`).toBe(
        new URL(target, BASE).href,
      )
    }
  })

  describe('legitimate targets are unchanged', () => {
    it('keeps an intentional cross-origin redirect', () => {
      const c = classifyRedirectTarget('https://ok.example/x')
      expect(c.kind).toBe('external')
      expect(c.url).toBe('https://ok.example/x')
    })

    it('keeps an internal path, and returns the value it judged', () => {
      // The `internal` branch used to return the ORIGINAL string rather than
      // the one it inspected — so even a correct verdict handed back bytes that
      // produce a different one.
      const c = classifyRedirectTarget('  /ok?a=1')
      expect(c.kind).toBe('internal')
      expect(c.url).toBe('/ok?a=1')
    })

    it('leaves an interior NUL alone — the URL parser does not strip it', () => {
      // Only tab and newline are removed from the interior. A NUL in a path is
      // percent-encoded by the parser, not deleted, so it stays same-origin and
      // must not be blocked.
      const c = classifyRedirectTarget(`/a${NUL}b`)
      expect(c.kind).toBe('internal')
      expect(new URL(landsAt(`/a${NUL}b`)).origin).toBe(BASE)
    })
  })
})
