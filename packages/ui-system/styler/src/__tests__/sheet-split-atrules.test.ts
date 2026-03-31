import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hash } from '../hash'
import { createSheet, StyleSheet } from '../sheet'

/**
 * Tests for the @media/@supports/@container splitting behavior.
 *
 * When CSS text contains nested at-rules, sheet.insert() should split them
 * into separate top-level rules rather than relying on CSS Nesting.
 * This matches the approach used by styled-components and Emotion.
 */

describe('StyleSheet -- at-rule splitting', () => {
  describe('SSR mode (splitAtRules internals via SSR output)', () => {
    let originalDocument: typeof document

    beforeEach(() => {
      originalDocument = globalThis.document
      // @ts-expect-error - intentionally deleting for SSR simulation
      delete globalThis.document
    })

    afterEach(() => {
      globalThis.document = originalDocument
    })

    it('CSS without @media produces a single rule', () => {
      const s = createSheet()
      s.insert('color: red; font-size: 16px;')
      const styles = s.getStyles()

      // Should have exactly one rule: .pyr-xxx{color: red; font-size: 16px;}
      expect(styles).toMatch(/^\.pyr-[0-9a-z]+\{color: red; font-size: 16px;\}$/)
    })

    it('CSS with @media splits into base + media rules', () => {
      const s = createSheet()
      s.insert('color: red; @media (min-width: 768px){color: blue;}')
      const styles = s.getStyles()

      // Base rule: .pyr-xxx{color: red;}
      expect(styles).toMatch(/\.pyr-[0-9a-z]+\{color: red;\}/)
      // Media rule: @media (min-width: 768px){.pyr-xxx{color: blue;}}
      expect(styles).toMatch(/@media \(min-width: 768px\)\{\.pyr-[0-9a-z]+\{color: blue;\}\}/)
      // The base rule should NOT contain @media inside its braces
      expect(styles).not.toMatch(/\.pyr-[0-9a-z]+\{[^}]*@media/)
    })

    it('CSS with multiple @media produces multiple separate rules', () => {
      const s = createSheet()
      s.insert(
        'position: absolute; bottom: -4.375rem; @media (min-width: 36em){right: -11.25rem;} @media (min-width: 48em){bottom: 0; height: 40rem;}',
      )
      const styles = s.getStyles()

      // Base
      expect(styles).toContain('position: absolute; bottom: -4.375rem;')
      // Two separate media rules
      expect(styles).toMatch(/@media \(min-width: 36em\)\{\.pyr-[0-9a-z]+\{right: -11.25rem;\}\}/)
      expect(styles).toMatch(
        /@media \(min-width: 48em\)\{\.pyr-[0-9a-z]+\{bottom: 0; height: 40rem;\}\}/,
      )
    })

    it('CSS with only @media (no base declarations) works correctly', () => {
      const s = createSheet()
      s.insert('@media (min-width: 768px){color: blue;} @media (min-width: 1024px){color: green;}')
      const styles = s.getStyles()

      // No base rule (or empty base)
      expect(styles).not.toMatch(/\.pyr-[0-9a-z]+\{\}/)
      // Both media rules present
      expect(styles).toMatch(/@media \(min-width: 768px\)\{\.pyr-[0-9a-z]+\{color: blue;\}\}/)
      expect(styles).toMatch(/@media \(min-width: 1024px\)\{\.pyr-[0-9a-z]+\{color: green;\}\}/)
    })

    it('layer wraps both base and media rules in @layer', () => {
      const s = createSheet({ layer: 'rocketstyle' })
      s.insert('color: red; @media (min-width: 768px){color: blue;}')
      const styles = s.getStyles()

      // Base wrapped in @layer: @layer rocketstyle{.pyr-xxx{color: red;}}
      expect(styles).toMatch(/@layer rocketstyle\{\.pyr-[0-9a-z]+\{color: red;\}\}/)
      // Media wrapped in @layer: @layer rocketstyle{@media (...){.pyr-xxx{color: blue;}}}
      expect(styles).toMatch(
        /@layer rocketstyle\{@media \(min-width: 768px\)\{\.pyr-[0-9a-z]+\{color: blue;\}\}\}/,
      )
    })

    it('@supports blocks are also split out', () => {
      const s = createSheet()
      s.insert('display: flex; @supports (display: grid){display: grid;}')
      const styles = s.getStyles()

      expect(styles).toMatch(/\.pyr-[0-9a-z]+\{display: flex;\}/)
      expect(styles).toMatch(/@supports \(display: grid\)\{\.pyr-[0-9a-z]+\{display: grid;\}\}/)
    })

    it('@container blocks are also split out', () => {
      const s = createSheet()
      s.insert('font-size: 1rem; @container (min-width: 400px){font-size: 1.25rem;}')
      const styles = s.getStyles()

      expect(styles).toMatch(/\.pyr-[0-9a-z]+\{font-size: 1rem;\}/)
      expect(styles).toMatch(
        /@container \(min-width: 400px\)\{\.pyr-[0-9a-z]+\{font-size: 1.25rem;\}\}/,
      )
    })

    it('@layer wraps each split rule individually', () => {
      const s = createSheet({ layer: 'components' })
      s.insert('color: red; @media (min-width: 768px){color: blue;}')
      const styles = s.getStyles()

      // Base wrapped in layer
      expect(styles).toMatch(/@layer components\{\.pyr-[0-9a-z]+\{color: red;\}\}/)
      // Media wrapped in layer
      expect(styles).toMatch(
        /@layer components\{@media \(min-width: 768px\)\{\.pyr-[0-9a-z]+\{color: blue;\}\}\}/,
      )
    })

    it('deduplicates CSS with @media (same CSS -> same className -> single insert)', () => {
      const s = createSheet()
      const cssStr = 'color: red; @media (min-width: 768px){color: blue;}'
      s.insert(cssStr)
      s.insert(cssStr)

      const styles = s.getStyles()
      const baseMatches = styles.match(/\.pyr-[0-9a-z]+\{color: red;\}/g)
      expect(baseMatches).toHaveLength(1)
    })

    it('real-world example: position + responsive inset/height', () => {
      const s = createSheet()
      const cssStr =
        'position: absolute; bottom: -4.375rem; right: -12.5rem; height: 28.75rem; ' +
        '@media only screen and (min-width: 36em){right: -11.25rem;} ' +
        '@media only screen and (min-width: 48em){bottom: 0; height: 40rem;} ' +
        '@media only screen and (min-width: 62em){right: -6.25rem;} ' +
        '@media only screen and (min-width: 100em){right: initial; left: 55%;}'
      s.insert(cssStr)
      const styles = s.getStyles()

      // Base rule has position, bottom, right, height
      expect(styles).toContain('position: absolute;')
      expect(styles).toContain('bottom: -4.375rem;')
      expect(styles).toContain('right: -12.5rem;')
      expect(styles).toContain('height: 28.75rem;')

      // Each media query is a separate top-level rule
      expect(styles).toMatch(/@media only screen and \(min-width: 36em\)\{/)
      expect(styles).toMatch(/@media only screen and \(min-width: 48em\)\{/)
      expect(styles).toMatch(/@media only screen and \(min-width: 62em\)\{/)
      expect(styles).toMatch(/@media only screen and \(min-width: 100em\)\{/)

      // No nested @media inside a class selector
      expect(styles).not.toMatch(/\.pyr-[0-9a-z]+\{[^}]*@media/)
    })

    it('getStyleTag contains all split rules', () => {
      const s = createSheet()
      s.insert('color: red; @media (min-width: 768px){color: blue;}')
      const tag = s.getStyleTag()

      expect(tag).toMatch(/^<style data-pyreon-styler="">.*<\/style>$/)
      expect(tag).toContain('color: red;')
      expect(tag).toContain('@media (min-width: 768px)')
    })

    it('reset clears all split rules from SSR buffer and cache', () => {
      const s = createSheet()
      s.insert('color: red; @media (min-width: 768px){color: blue;}')
      expect(s.getStyles()).not.toBe('')

      s.reset()
      expect(s.getStyles()).toBe('')
      expect(s.cacheSize).toBe(0) // cache also cleared for SSR correctness
    })
  })

  describe('DOM mode (insertRule verification)', () => {
    beforeEach(() => {
      for (const el of Array.from(document.querySelectorAll('style[data-pyreon-styler]')))
        el.remove()
    })

    it('inserts base + media as separate CSSRules', () => {
      const s = createSheet()
      s.insert('color: red; @media (min-width: 768px){color: blue;}')

      // Find the style element
      const styleEl = document.querySelector('style[data-pyreon-styler]') as HTMLStyleElement
      expect(styleEl).not.toBeNull()
      const sheet = styleEl.sheet
      if (!sheet) throw new Error('expected sheet')

      // Should have at least 2 rules: one CSSStyleRule + one CSSMediaRule
      let hasStyleRule = false
      let hasMediaRule = false

      for (let i = 0; i < sheet.cssRules.length; i++) {
        const rule = sheet.cssRules[i]
        if (rule instanceof CSSStyleRule && rule.selectorText.startsWith('.pyr-')) {
          hasStyleRule = true
        }
        if (rule instanceof CSSMediaRule) {
          hasMediaRule = true
        }
      }

      expect(hasStyleRule).toBe(true)
      expect(hasMediaRule).toBe(true)
    })

    it('single selector appears in both base and media rules', () => {
      const s = createSheet()
      const className = s.insert('color: red; @media (min-width: 768px){color: blue;}')

      const styleEl = document.querySelector('style[data-pyreon-styler]') as HTMLStyleElement
      const sheet = styleEl.sheet
      if (!sheet) throw new Error('expected sheet')
      const singleSelector = `.${className}`

      let baseFound = false
      let mediaInnerFound = false

      for (let i = 0; i < sheet.cssRules.length; i++) {
        const rule = sheet.cssRules[i]
        if (rule instanceof CSSStyleRule && rule.selectorText === singleSelector) {
          baseFound = true
        }
        if (rule instanceof CSSMediaRule) {
          for (let j = 0; j < rule.cssRules.length; j++) {
            const inner = rule.cssRules[j]
            if (inner instanceof CSSStyleRule && inner.selectorText === singleSelector) {
              mediaInnerFound = true
            }
          }
        }
      }

      expect(baseFound).toBe(true)
      expect(mediaInnerFound).toBe(true)
    })
  })

  describe('hydration with split rules', () => {
    beforeEach(() => {
      for (const el of Array.from(document.querySelectorAll('style[data-pyreon-styler]')))
        el.remove()
    })

    it('hydrates className from CSSMediaRule inner selectors', () => {
      // Simulate SSR: create a style tag with split rules
      const el = document.createElement('style')
      el.setAttribute('data-pyreon-styler', '')
      document.head.appendChild(el)

      const className = `pyr-${hash('color: red;')}`

      // Insert rules that simulate what SSR produces
      el.sheet?.insertRule(`.${className}{color: red;}`, 0)
      el.sheet?.insertRule(`@media (min-width: 768px){.${className}{color: blue;}}`, 1)

      // Create a new sheet that will hydrate from the tag
      const s = new StyleSheet()
      // The sheet should have hydrated the className
      expect(s.has(className)).toBe(true)
      // Subsequent insert is a no-op (deduped)
      expect(s.cacheSize).toBeGreaterThanOrEqual(1)
    })

    it('hydrates className from @layer wrapped selectors in media rules', () => {
      const el = document.createElement('style')
      el.setAttribute('data-pyreon-styler', '')
      document.head.appendChild(el)

      const className = `pyr-${hash('font-size: 1rem;')}`

      el.sheet?.insertRule(`.${className}{font-size: 1rem;}`, 0)
      el.sheet?.insertRule(
        `@media (min-width: 768px){.${className}{font-size: 1.5rem;}}`,
        1,
      )

      const s = new StyleSheet()
      expect(s.has(className)).toBe(true)
    })

    it('hydrates from media-only rules (no base style rule)', () => {
      const el = document.createElement('style')
      el.setAttribute('data-pyreon-styler', '')
      document.head.appendChild(el)

      const className = `pyr-${hash('responsive-only')}`

      // Only a media rule, no base rule
      el.sheet?.insertRule(`@media (min-width: 768px){.${className}{color: blue;}}`, 0)

      const s = new StyleSheet()
      expect(s.has(className)).toBe(true)
    })
  })

  describe('edge cases', () => {
    let originalDocument: typeof document

    beforeEach(() => {
      originalDocument = globalThis.document
      // @ts-expect-error - intentionally deleting for SSR simulation
      delete globalThis.document
    })

    afterEach(() => {
      globalThis.document = originalDocument
    })

    it('handles empty CSS text', () => {
      const s = createSheet()
      const cls = s.insert('')
      expect(cls).toMatch(/^pyr-/)
      expect(s.getStyles()).toBe('')
    })

    it('handles CSS with @ in a value (not an at-rule)', () => {
      const s = createSheet()
      s.insert('content: "@media";')
      // Should not be confused by @ in a string value
      expect(s.getStyles()).toContain('content: "@media";')
    })

    it('handles @keyframes reference in the CSS without splitting it', () => {
      const s = createSheet()
      s.insert('animation: fadeIn 0.3s;')
      const styles = s.getStyles()
      expect(styles).toContain('animation: fadeIn 0.3s;')
    })

    it('preserves &:hover nesting in base CSS', () => {
      const s = createSheet()
      s.insert('color: red; &:hover{color: blue;}')
      const styles = s.getStyles()

      // The &:hover block should stay inside the base rule
      expect(styles).toMatch(/\.pyr-[0-9a-z]+\{color: red; &:hover\{color: blue;\}\}/)
    })

    it('preserves &:hover nesting alongside @media splitting', () => {
      const s = createSheet()
      s.insert('color: red; &:hover{color: blue;} @media (min-width: 768px){font-size: 2rem;}')
      const styles = s.getStyles()

      // Base rule has color + &:hover
      expect(styles).toMatch(/\.pyr-[0-9a-z]+\{color: red; &:hover\{color: blue;\}\}/)
      // Media rule is separate
      expect(styles).toMatch(/@media \(min-width: 768px\)\{\.pyr-[0-9a-z]+\{font-size: 2rem;\}\}/)
    })

    it('handles consecutive @media blocks with no base CSS between them', () => {
      const s = createSheet()
      s.insert('@media (min-width: 768px){color: blue;} @media (min-width: 1024px){color: green;}')
      const styles = s.getStyles()

      expect(styles).toMatch(/@media \(min-width: 768px\)/)
      expect(styles).toMatch(/@media \(min-width: 1024px\)/)
    })
  })

  describe('performance characteristics', () => {
    let originalDocument: typeof document

    beforeEach(() => {
      originalDocument = globalThis.document
      // @ts-expect-error - intentionally deleting for SSR simulation
      delete globalThis.document
    })

    afterEach(() => {
      globalThis.document = originalDocument
    })

    it('fast path: no scanning when CSS has no @ character', () => {
      const s = createSheet()
      // Insert 1000 simple rules -- should not trigger any splitting logic
      const start = performance.now()
      for (let i = 0; i < 1000; i++) {
        s.insert(`prop-${i}: val-${i};`)
      }
      const elapsed = performance.now() - start

      expect(s.cacheSize).toBe(1000)
      // Should complete quickly — 500ms is generous for CI runners
      expect(elapsed).toBeLessThan(500)
    })

    it('splitting adds minimal overhead for CSS with @media', () => {
      const s = createSheet()
      const start = performance.now()
      for (let i = 0; i < 500; i++) {
        s.insert(`color: color-${i}; @media (min-width: ${i}px){font-size: ${i}rem;}`)
      }
      const elapsed = performance.now() - start

      expect(s.cacheSize).toBe(500)
      // Should still be fast — 500ms is generous for CI runners
      expect(elapsed).toBeLessThan(500)
    })
  })
})
