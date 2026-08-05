/**
 * The default-sanitizer registration SEAM.
 *
 * This file deliberately does NOT import '../sanitizer' — vitest's per-file
 * isolation means the default is UNREGISTERED here, proving (a) the sanitized
 * `innerHTML` path throws with the actionable fix instead of silently
 * applying UNSANITIZED html (the security-critical direction), and (b)
 * `setSanitizer` still works without the default. The registered-path
 * behavior is covered by every sanitize spec in props/mount/coverage tests
 * (which import '../sanitizer' explicitly — the documented non-Vite path;
 * @pyreon/vite-plugin injects it automatically for app modules using
 * `innerHTML`).
 *
 * Bisect: making sanitizeHtml fall back to raw html instead of throwing
 * fails the first spec (unsanitized script would land in the DOM).
 */
import { describe, expect, it } from 'vitest'
import { sanitizeHtml, setSanitizer } from '../index'

describe('sanitizer seam (unregistered in this file)', () => {
  it('sanitizeHtml THROWS with the actionable fix when nothing is registered', () => {
    expect(() => sanitizeHtml('<b>x</b><script>bad()</script>')).toThrowError(
      /@pyreon\/runtime-dom\/sanitizer|setSanitizer/,
    )
  })

  it('a custom setSanitizer works without the default registered', () => {
    setSanitizer((html) => html.replace(/<script[\s\S]*?<\/script>/g, ''))
    try {
      expect(sanitizeHtml('<b>x</b><script>bad()</script>')).toBe('<b>x</b>')
    } finally {
      setSanitizer(null)
    }
  })
})
