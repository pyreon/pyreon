/**
 * Scripted-SVG detection inside an `image/svg+xml` data URI.
 *
 * `isSafeImageDataUri` lets an SVG data URI through only when it carries no
 * `<script>` and no `on*=` handler. The handler half required WHITESPACE before
 * the name, which is a separator-shaped mental model of a tokenizer that has
 * three more ways to arrive at an attribute. Verified against a real Chromium
 * `DOMParser` in `text/html` mode — the "if the URI ever reaches a
 * script-executing context" case this check exists for — every payload below
 * produces a LIVE `onload` attribute, and the first two were ALLOWED before.
 *
 * The quote-adjacent one is the shape a hand-enumerated separator list misses:
 * there is no separator at all. After a quoted attribute value the tokenizer
 * recovers from the parse error straight into before-attribute-name.
 */
import { describe, expect, it } from 'vitest'
import { isSafeImageDataUri } from '../url-guard'

/** A `data:image/svg+xml` URI wrapping `inner`, url-encoded like a real one. */
const svgUri = (inner: string) => `data:image/svg+xml,${encodeURIComponent(inner)}`
const b64 = (inner: string) => `data:image/svg+xml;base64,${btoa(inner)}`

const NS = 'http://www.w3.org/2000/svg'

describe('scripted-SVG detection — every separator the tokenizer accepts', () => {
  const SCRIPTED: [string, string][] = [
    ['space', `<svg xmlns="${NS}" onload="alert(1)"/>`],
    ['newline', `<svg xmlns="${NS}"\nonload="alert(1)"/>`],
    ['tab', `<svg xmlns="${NS}"\tonload="alert(1)"/>`],
    ['formfeed', `<svg xmlns="${NS}"\fonload="alert(1)"/>`],
    ['slash', `<svg xmlns="${NS}"/onload="alert(1)"/>`],
    ['double slash', `<svg xmlns="${NS}"//onload="alert(1)"/>`],
    ['comment-looking slashes', `<svg xmlns="${NS}"/**/onload="alert(1)"/>`],
    ['NO separator (quote-adjacent)', `<svg xmlns="${NS}"onload="alert(1)"/>`],
    ['single-quoted value, quote-adjacent', `<svg xmlns='${NS}'onload='alert(1)'/>`],
    ['spaces around the equals', `<svg xmlns="${NS}" onload = "alert(1)"/>`],
    ['hyphenated handler name', `<svg xmlns="${NS}"/on-anything="alert(1)"/>`],
    ['script tag', `<svg xmlns="${NS}"><script>alert(1)</script></svg>`],
    ['script tag with space', `<svg xmlns="${NS}">< script>alert(1)</script></svg>`],
    ['uppercase ONLOAD', `<svg xmlns="${NS}"/ONLOAD="alert(1)"/>`],
  ]

  for (const [label, payload] of SCRIPTED) {
    it(`refuses a scripted SVG: ${label}`, () => {
      expect(isSafeImageDataUri('img', 'src', svgUri(payload))).toBe(false)
    })
    it(`refuses it base64-encoded too: ${label}`, () => {
      expect(isSafeImageDataUri('img', 'src', b64(payload))).toBe(false)
    })
  }

  it('a clean SVG is still ALLOWED (the guard must not refuse everything)', () => {
    const clean = `<svg xmlns="${NS}" viewBox="0 0 8 8"><rect width="8" height="8" fill="#eee"/></svg>`
    expect(isSafeImageDataUri('img', 'src', svgUri(clean))).toBe(true)
    expect(isSafeImageDataUri('img', 'src', b64(clean))).toBe(true)
  })

  it('a word merely CONTAINING "on" is not a handler', () => {
    // The widened separator class must not start matching ordinary markup.
    const clean = `<svg xmlns="${NS}"><text font="x">only once</text></svg>`
    expect(isSafeImageDataUri('img', 'src', svgUri(clean))).toBe(true)
  })

  it('raster data URIs are unaffected', () => {
    expect(isSafeImageDataUri('img', 'src', 'data:image/png;base64,iVBORw0KGgo=')).toBe(true)
  })
})

describe('image-source attributes', () => {
  it('src and poster are image-source attributes', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    expect(isSafeImageDataUri('img', 'src', png)).toBe(true)
    expect(isSafeImageDataUri('video', 'poster', png)).toBe(true)
  })

  it('`srcset` is NOT — and never was, which is why the entry was dead', () => {
    // `isSafeImageDataUri` is only ever reached through `URL_ATTRS`, which has no
    // `srcset`, so the old entry could not fire. Asserted so the deletion is a
    // recorded decision rather than a silent narrowing: re-adding it means
    // adding `srcset` to `URL_ATTRS` AND splitting the candidate list.
    expect(isSafeImageDataUri('img', 'srcset', 'data:image/png;base64,iVBORw0KGgo=')).toBe(false)
  })

  it('a non-image-context tag never gets the data: exemption', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    expect(isSafeImageDataUri('iframe', 'src', png)).toBe(false)
    expect(isSafeImageDataUri('object', 'data', png)).toBe(false)
  })
})
