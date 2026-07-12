/**
 * CSP nonce support — the SSR `<style>` tag from `getStyleTag()` and the client
 * `<style>` element from `mount()` must carry a `nonce` when configured, so a
 * strict `style-src 'nonce-…'` policy (no `'unsafe-inline'`) admits the
 * critical CSS on first paint. Client-side CSSOM `insertRule` is CSP-exempt
 * regardless; this only covers the two inline-`<style>` surfaces.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSheet, StyleSheet } from '../sheet'

// Force the SSR (buffer) path — happy-dom defines `document`, so temporarily
// hide it to exercise `getStyleTag()` (which only produces rules in SSR mode).
function withoutDocument<T>(fn: () => T): T {
  const g = globalThis as { document?: unknown }
  const saved = g.document
  // Deliberately hide `document` so the sheet takes its SSR (buffer) path.
  delete g.document
  try {
    return fn()
  } finally {
    g.document = saved
  }
}

describe('CSP nonce', () => {
  it('getStyleTag(nonce) stamps the nonce attribute on the SSR <style>', () => {
    withoutDocument(() => {
      const s = new StyleSheet()
      s.insert('color: red;')
      const tag = s.getStyleTag('abc123')
      expect(tag).toMatch(/^<style data-pyreon-styler="" nonce="abc123">/)
      expect(tag).toContain('.pyr-')
    })
  })

  it('StyleSheetOptions.nonce is the default nonce for getStyleTag()', () => {
    withoutDocument(() => {
      const s = createSheet({ nonce: 'deadbeef' })
      s.insert('color: blue;')
      expect(s.getStyleTag()).toContain('nonce="deadbeef"')
    })
  })

  it('a per-call nonce overrides the instance nonce', () => {
    withoutDocument(() => {
      const s = createSheet({ nonce: 'instance-nonce' })
      s.insert('color: green;')
      const tag = s.getStyleTag('request-nonce')
      expect(tag).toContain('nonce="request-nonce"')
      expect(tag).not.toContain('instance-nonce')
    })
  })

  it('emits the nonce even on an empty buffer', () => {
    withoutDocument(() => {
      const s = createSheet({ nonce: 'n0' })
      expect(s.getStyleTag()).toBe('<style data-pyreon-styler="" nonce="n0"></style>')
    })
  })

  it('no nonce → no attribute (byte-identical to the pre-nonce output)', () => {
    withoutDocument(() => {
      const s = new StyleSheet()
      s.insert('color: red;')
      expect(s.getStyleTag()).not.toContain('nonce')
      expect(s.getStyleTag()).toMatch(/^<style data-pyreon-styler="">/)
    })
  })

  it('strips quotes/`>` from the nonce so it cannot break out of the attribute', () => {
    withoutDocument(() => {
      const s = new StyleSheet()
      s.insert('color: red;')
      // A hostile nonce trying to inject a second attribute / close the tag.
      const tag = s.getStyleTag('x"><script>alert(1)</script>')
      expect(tag).not.toContain('<script>')
      expect(tag).toContain('nonce="xscriptalert(1)/script"')
    })
  })

  describe('client <style> element (happy-dom)', () => {
    // The singleton `sheet` mounted a nonce-less <style> at module load;
    // `mount()` REUSES an existing tag (the SSR-hydration path), so clear all
    // tags first to force the create-new branch that applies the nonce.
    beforeEach(() => {
      for (const el of Array.from(document.querySelectorAll('style[data-pyreon-styler]')))
        el.remove()
    })
    afterEach(() => {
      for (const el of Array.from(document.querySelectorAll('style[data-pyreon-styler]')))
        el.remove()
    })

    it('sets nonce on the mounted <style> element when configured', () => {
      createSheet({ nonce: 'client-nonce' })
      const el = document.querySelector('style[data-pyreon-styler]') as HTMLStyleElement
      expect(el).toBeTruthy()
      expect(el.getAttribute('nonce')).toBe('client-nonce')
    })

    it('no nonce → the client <style> has no nonce attribute', () => {
      createSheet()
      const el = document.querySelector('style[data-pyreon-styler]') as HTMLStyleElement
      expect(el.hasAttribute('nonce')).toBe(false)
    })
  })
})
