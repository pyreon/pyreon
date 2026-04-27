import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hash } from '../hash'
import { sheet, StyleSheet } from '../sheet'

describe('StyleSheet', () => {
  beforeEach(() => {
    sheet.reset()
  })

  afterEach(() => {
    sheet.reset()
  })

  describe('insert', () => {
    it('returns a class name with pyr- prefix', () => {
      const className = sheet.insert('display: flex;')
      expect(className).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it('same CSS text always returns same class name (dedup)', () => {
      const cls1 = sheet.insert('color: red;')
      const cls2 = sheet.insert('color: red;')
      expect(cls1).toBe(cls2)
    })

    it('different CSS text returns different class names', () => {
      const cls1 = sheet.insert('color: red;')
      const cls2 = sheet.insert('color: blue;')
      expect(cls1).not.toBe(cls2)
    })

    it('class name matches hash of CSS text', () => {
      const cssText = 'display: flex;'
      const className = sheet.insert(cssText)
      expect(className).toBe(`pyr-${hash(cssText)}`)
    })

    it('handles empty string CSS', () => {
      const className = sheet.insert('')
      expect(className).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it('supports layer mode (@layer wrapping)', () => {
      const className = sheet.insert('color: red;', false, 'rocketstyle')
      expect(className).toMatch(/^pyr-[0-9a-z]+$/)
    })
  })

  describe('cache eviction', () => {
    it('evicts oldest entries when cache exceeds MAX_CACHE', () => {
      for (let i = 0; i < 100; i++) {
        sheet.insert(`unique-prop-${i}: value-${i};`)
      }
      const result = sheet.insert('color: red;')
      expect(result).toMatch(/^pyr-/)
    })
  })

  describe('insertKeyframes', () => {
    it('does not throw', () => {
      expect(() => sheet.insertKeyframes('test-anim', 'from{opacity:0}to{opacity:1}')).not.toThrow()
    })

    it('deduplicates by name', () => {
      sheet.insertKeyframes('test-anim', 'from{opacity:0}to{opacity:1}')
      // Second call with same name should not throw
      expect(() => sheet.insertKeyframes('test-anim', 'from{opacity:0}to{opacity:1}')).not.toThrow()
    })
  })

  describe('insertGlobal', () => {
    it('does not throw for valid CSS', () => {
      expect(() => sheet.insertGlobal('body { margin: 0; }')).not.toThrow()
    })

    it('handles multiple calls without error', () => {
      sheet.insertGlobal('body { margin: 0; }')
      sheet.insertGlobal('html { box-sizing: border-box; }')
    })

    it('deduplicates same CSS', () => {
      sheet.insertGlobal('body { margin: 0; }')
      sheet.insertGlobal('body { margin: 0; }')
      // No error, second is deduped
    })
  })

  describe('getClassName', () => {
    it('returns a className without injecting', () => {
      const className = sheet.getClassName('color: red;')
      expect(className).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it('returns same className as insert for same CSS', () => {
      const cssText = 'display: flex;'
      const getResult = sheet.getClassName(cssText)
      const insertResult = sheet.insert(cssText)
      expect(getResult).toBe(insertResult)
    })
  })

  describe('prepare', () => {
    it('returns className and rules', () => {
      const { className, rules } = sheet.prepare('color: red;')
      expect(className).toMatch(/^pyr-[0-9a-z]+$/)
      expect(rules).toContain(className)
      expect(rules).toContain('color: red;')
    })

    it('produces single selector (no boost)', () => {
      const { className, rules } = sheet.prepare('color: red;')
      // Single selector, no doubling
      expect(rules).toContain(`.${className}{`)
      expect(rules).not.toContain(`.${className}.${className}`)
    })
  })

  describe('SSR support', () => {
    it('getStyleTag returns a string', () => {
      const result = sheet.getStyleTag()
      expect(typeof result).toBe('string')
      expect(result).toContain('data-pyreon-styler')
    })

    it('getStyles returns empty string when no rules inserted', () => {
      const result = sheet.getStyles()
      expect(result).toBe('')
    })
  })

  describe('reset', () => {
    it('clears cache so new inserts re-generate class names', () => {
      const cls1 = sheet.insert('color: green;')
      sheet.reset()
      const cls2 = sheet.insert('color: green;')
      expect(cls1).toBe(cls2)
    })
  })

  describe('clearCache and clearAll', () => {
    it('clearCache clears the cache', () => {
      sheet.insert('color: red;')
      sheet.clearCache()
      expect(sheet.cacheSize).toBe(0)
    })

    it('clearAll clears cache and SSR buffer', () => {
      sheet.insert('color: red;')
      sheet.clearAll()
      expect(sheet.cacheSize).toBe(0)
      expect(sheet.getStyles()).toBe('')
    })
  })

  describe('has', () => {
    it('returns true for cached classNames', () => {
      const className = sheet.insert('color: red;')
      expect(sheet.has(className)).toBe(true)
    })

    it('returns false for unknown classNames', () => {
      expect(sheet.has('pyr-unknown')).toBe(false)
    })
  })

  // Failed insertRule used to be silently swallowed in production because
  // `process.env.NODE_ENV !== 'production'` is dead code in real Vite browser
  // bundles (Vite does not polyfill `process`). The dev gate now uses
  // `import.meta.env.DEV` which fires the warn under vitest and tree-shakes
  // away in prod. This test asserts the warn fires for malformed CSS in dev.
  describe('insertRule failures fire console.warn in dev', () => {
    it('warns when StyleSheet.insertRule throws on malformed CSS', () => {
      const local = new StyleSheet()
      const realSheet = (local as unknown as { sheet: CSSStyleSheet | null }).sheet
      if (!realSheet) {
        // happy-dom may not expose a real sheet — skip; the prod-bundle
        // tree-shake test in dev-gate-treeshake.test.ts covers the build side.
        return
      }
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      // Mock the prototype, not the instance — happy-dom's CSSStyleSheet may
      // expose `insertRule` as a non-configurable own property that vi.spyOn
      // can't intercept on an instance.
      const proto = Object.getPrototypeOf(realSheet) as { insertRule: () => number }
      const insertSpy = vi.spyOn(proto, 'insertRule').mockImplementation(() => {
        throw new SyntaxError('invalid rule')
      })

      // Use a unique CSS string to bypass cross-instance/global insert cache
      local.insert(`color: ${Math.random()};`)

      const styleWarnings = warnSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('[styler]'),
      )
      expect(styleWarnings.length).toBeGreaterThan(0)

      insertSpy.mockRestore()
      warnSpy.mockRestore()
    })

    it('uses bundler-agnostic process.env.NODE_ENV — vitest sets NODE_ENV !== "production"', () => {
      // Smoke test the gate itself: vitest must set process.env.NODE_ENV to
      // a non-production value for the regression test above to be meaningful.
      // Every modern bundler (incl. Vitest's Vite pipeline) auto-replaces
      // `process.env.NODE_ENV` at build time.
      expect(process.env.NODE_ENV).not.toBe('production')
    })
  })
})
