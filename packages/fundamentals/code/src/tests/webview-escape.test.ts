/**
 * The WebView host page must not be escapable through its own options.
 *
 * Two escapes were wrong here, and a PR this cycle hardened these exact
 * functions for the JS-string context while leaving both:
 *
 *  1. `scriptSafe` only broke `</`. The HTML tokenizer also enters the
 *     script-data-DOUBLE-escaped state on `<!--` followed by `<script`, and in
 *     that state the page's OWN literal `</script>` no longer ends the element
 *     — the rest of the document becomes script content.
 *  2. `background` was `&quot;`-escaped into a `<style>` body. `<style>` is a
 *     RAW-TEXT element, so character references are never decoded there: the
 *     escaping was inert and `</style>` in the value closed the element.
 *
 * These are DEVELOPER-supplied options rather than request data, so this is
 * defence-in-depth — but the escapes were simply wrong, and an app that derives
 * a theme colour from content would have been exposed.
 *
 * Bisect-verified: restoring either old escape fails the matching spec.
 */
import { describe, expect, it } from 'vitest'
import { buildCodeHostHtml } from '../webview'

describe('buildCodeHostHtml — the host page cannot be escaped through its options', () => {
  it('a `background` cannot close the <style> element', () => {
    const html = buildCodeHostHtml({
      background: 'red}</style><script>globalThis.PWNED=1</script><style>{',
    })
    expect(html).not.toContain('</style><script>')
    // The payload's TAGS must not form. Its inert text can survive inside the
    // sheet — asserting the word is absent would be asserting the wrong thing.
    expect(html).not.toContain('<script>globalThis')
    expect(html).toContain('globalThis.PWNED=1')
  })

  it('a `background` cannot smuggle a quote into the sheet', () => {
    const html = buildCodeHostHtml({ background: 'url("x")' })
    // `&quot;` is inert inside raw text, so the quote is DROPPED, not encoded.
    expect(html).not.toContain('&quot;')
    expect(html).toContain('url(x)')
  })

  it('an ordinary colour still reaches the sheet unchanged', () => {
    // The guard must not eat real CSS — that is what keeps it from being
    // "stop rendering the option".
    expect(buildCodeHostHtml({ background: '#0b0d12' })).toContain('background:#0b0d12')
    expect(buildCodeHostHtml({ background: 'rgb(11 13 18 / 80%)' })).toContain('rgb(11 13 18 / 80%)')
  })

  it('an inlined engine script cannot close the <script> element', () => {
    const html = buildCodeHostHtml({ codemirrorScript: 'var a = "</script><img src=x onerror=alert(1)>"' })
    expect(html).not.toContain('</script><img')
  })

  it('an inlined engine script cannot open the double-escaped state', () => {
    // `<!--` + `<script` puts the tokenizer in script-data-double-escaped,
    // where the page's own `</script>` stops ending the element.
    const html = buildCodeHostHtml({ codemirrorScript: 'var a = "<!--<script>"' })
    expect(html).not.toContain('"<!--<script')
    expect(html).toContain('<!\\--')
  })

  it('a `codemirrorSrc` cannot break out of its attribute', () => {
    const html = buildCodeHostHtml({ codemirrorSrc: 'x.js" onload="alert(1)' })
    expect(html).not.toContain('onload="alert(1)"')
    expect(html).toContain('&quot;')
  })
})
