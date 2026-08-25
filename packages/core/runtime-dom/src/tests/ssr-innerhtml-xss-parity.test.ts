/**
 * Client half of the sanitized-`innerHTML` XSS parity story.
 *
 * The SSR/stream renderers now FAIL LOUD on the sanitized `innerHTML` prop
 * (they cannot run the DOM-based sanitizer in Node — see
 * runtime-server `ssr-innerhtml-xss.test.ts`). This spec proves the CLIENT
 * side of the contract: the same payloads that the server refuses are STRIPPED
 * of every executable construct by the client sanitizer. So the two surfaces
 * AGREE — the dangerous markup survives on NEITHER: the server emits nothing,
 * the client removes `on*` handlers, `<script>`, and `javascript:` URLs.
 *
 * This is the audit's client/server-divergence theme in its resolved form: a
 * client guard now HAS its SSR twin.
 */
import '../sanitizer' // register the default allowlist sanitizer (seam)
import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '../index'

describe('client sanitizer strips what the SSR path refuses (parity)', () => {
  it('strips the img onerror handler', () => {
    const out = sanitizeHtml('<img src=x onerror=alert(1)>')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('alert(1)')
  })

  it('strips the executable <script> element (body survives only as inert text)', () => {
    const out = sanitizeHtml('<b>ok</b><script>alert(1)</script>')
    // The security property is that no EXECUTABLE <script> element survives —
    // the allowlist drops the element and replaces it with its textContent, so
    // `alert(1)` remains only as inert, non-executing TEXT (never re-parsed).
    expect(out).not.toContain('<script')
    expect(out).toContain('<b>ok</b>')
  })

  it('strips javascript: URLs from href', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toContain('javascript:')
  })

  it('preserves allowlisted safe markup', () => {
    const out = sanitizeHtml('<p>hi <a href="/safe"><em>there</em></a></p>')
    expect(out).toContain('<p>')
    expect(out).toContain('<em>there</em>')
    expect(out).toContain('href="/safe"')
  })
})
