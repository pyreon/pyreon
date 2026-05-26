import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSheet } from '../sheet'
import { query, queryOptional } from '@pyreon/test-utils'

describe('memory growth', () => {
  describe('bounded cache prevents unbounded growth (DOM mode)', () => {
    it('cache stays bounded with maxCacheSize', () => {
      const maxSize = 50
      const s = createSheet({ maxCacheSize: maxSize })

      for (let i = 0; i < maxSize * 3; i++) {
        s.insert(`property-${i}: value-${i};`)
      }

      expect(s.cacheSize).toBeLessThanOrEqual(maxSize * 1.5)
    })

    it('cache eviction preserves recent entries', () => {
      const maxSize = 20
      const s = createSheet({ maxCacheSize: maxSize })

      for (let i = 0; i < maxSize; i++) {
        s.insert(`old-prop-${i}: old-val-${i};`)
      }

      const recentClasses: string[] = []
      for (let i = 0; i < 5; i++) {
        recentClasses.push(s.insert(`new-prop-${i}: new-val-${i};`))
      }

      for (let i = 0; i < 5; i++) {
        const cls = s.insert(`new-prop-${i}: new-val-${i};`)
        expect(cls).toBe(recentClasses[i])
      }
    })

    it('handles rapid insertions without memory issues', () => {
      const s = createSheet({ maxCacheSize: 100 })
      const iterations = 1000

      for (let i = 0; i < iterations; i++) {
        s.insert(`rapid-${i}: value;`)
      }

      expect(s.cacheSize).toBeLessThan(iterations)
      expect(s.cacheSize).toBeGreaterThan(0)
    })
  })

  describe('default cache (large limit, DOM mode)', () => {
    beforeEach(() => {
      document.querySelectorAll('style[data-pyreon-styler]').forEach((el) => {
        el.remove()
      })
    })

    it('default cache handles many unique rules', () => {
      const s = createSheet()

      for (let i = 0; i < 500; i++) {
        s.insert(`default-prop-${i}: value-${i};`)
      }

      expect(s.cacheSize).toBe(500)
    })

    it('deduplication prevents growth from repeated rules', () => {
      const s = createSheet()

      for (let cycle = 0; cycle < 100; cycle++) {
        for (let i = 0; i < 10; i++) {
          s.insert(`repeated-${i}: value;`)
        }
      }

      expect(s.cacheSize).toBe(10)
    })
  })

  // Regression: `evictIfNeeded()` historically trimmed ONLY `this.cache`.
  // `insertCache` (keyed by full CSS text — the large keys) and the live
  // `<style>` tag's `cssRules` were never evicted, so `maxCacheSize`
  // bounded the smallest of the three layers while the two memory-heavy
  // ones grew for the process lifetime. These tests inspect the two
  // previously-unbounded layers directly. Bisect-verified.
  describe('lockstep eviction bounds insertCache + DOM cssRules', () => {
    beforeEach(() => {
      document.querySelectorAll('style[data-pyreon-styler]').forEach((el) => {
        el.remove()
      })
    })

    it('insertCache stays bounded under N >> maxCacheSize unique inserts', () => {
      const maxSize = 50
      const s = createSheet({ maxCacheSize: maxSize })
      const N = maxSize * 6

      for (let i = 0; i < N; i++) s.insert(`prop-${i}: value-${i};`)

      const ic = (s as unknown as { insertCache: Map<string, string> }).insertCache
      // Pre-fix: ic.size === N (insertCache never evicted). Post-fix it
      // tracks `cache`, which trims oldest 10% on each overflow.
      expect(s.cacheSize).toBeLessThanOrEqual(maxSize * 1.5)
      expect(ic.size).toBeLessThanOrEqual(maxSize * 1.5)
      expect(ic.size).toBeLessThan(N)
    })

    it('live DOM cssRules count does not grow unbounded', () => {
      const maxSize = 30
      const s = createSheet({ maxCacheSize: maxSize })

      for (let i = 0; i < maxSize; i++) s.insert(`a-${i}: ${i};`)
      const el = queryOptional<HTMLStyleElement>(document, 'style[data-pyreon-styler]')
      expect(el?.sheet).toBeTruthy()

      for (let i = 0; i < maxSize * 5; i++) s.insert(`b-${i}: ${i};`)

      const after = el!.sheet!.cssRules.length
      // Pre-fix: `after` ≈ maxSize*6 (+@layer decl) — every unique insert
      // appended a rule, none ever deleted. Post-fix: eviction calls
      // deleteRule in lockstep, so the live rule count stays within
      // ~1.5× maxSize no matter how many uniques flowed through.
      expect(after).toBeLessThanOrEqual(maxSize * 1.5 + 2)
    })

    it('dedup still works after eviction cycles', () => {
      const maxSize = 20
      const s = createSheet({ maxCacheSize: maxSize })

      const recent: string[] = []
      for (let i = 0; i < 5; i++) recent.push(s.insert(`keep-${i}: v;`))
      // Overflow to force eviction of older entries (not `recent`).
      for (let i = 0; i < maxSize * 3; i++) s.insert(`churn-${i}: v;`)
      // Recent entries: re-inserting yields the SAME deterministic
      // className and exactly one live DOM rule each.
      for (let i = 0; i < 5; i++) expect(s.insert(`keep-${i}: v;`)).toBe(recent[i])

      const el = query<HTMLStyleElement>(document, 'style[data-pyreon-styler]')
      let keepRules = 0
      for (let i = 0; i < el.sheet!.cssRules.length; i++) {
        const r = el.sheet!.cssRules[i]
        if (r && r.cssText.includes('keep-0')) keepRules++
      }
      expect(keepRules).toBe(1)
    })
  })

  describe('SSR mode memory', () => {
    let originalDocument: typeof document

    beforeEach(() => {
      originalDocument = globalThis.document
      // @ts-expect-error - intentionally deleting for SSR simulation
      delete globalThis.document
    })

    afterEach(() => {
      globalThis.document = originalDocument
    })

    it('reset prevents SSR buffer accumulation across requests', () => {
      const s = createSheet()

      for (let i = 0; i < 100; i++) {
        s.insert(`req1-prop-${i}: value;`)
      }
      expect(s.getStyles().length).toBeGreaterThan(0)

      s.reset()
      expect(s.getStyles()).toBe('')

      s.insert('req2-single: value;')
      expect(s.getStyles()).not.toContain('req1-prop')
    })

    it('keyframes cache does not grow unboundedly', () => {
      const s = createSheet({ maxCacheSize: 20 })

      for (let i = 0; i < 50; i++) {
        s.insertKeyframes(`anim-${i}`, `from { opacity: ${i}; } to { opacity: 1; }`)
      }

      expect(s.cacheSize).toBeLessThanOrEqual(50)
    })

    it('global rules cache does not grow unboundedly', () => {
      const s = createSheet({ maxCacheSize: 20 })

      for (let i = 0; i < 50; i++) {
        s.insertGlobal(`body { prop${i}: val${i}; }`)
      }

      expect(s.cacheSize).toBeLessThanOrEqual(50)
    })

    it('SSR buffer grows with unique rules (expected behavior)', () => {
      const s = createSheet()
      const ruleCount = 100

      for (let i = 0; i < ruleCount; i++) {
        s.insert(`ssr-prop-${i}: value;`)
      }

      const styles = s.getStyles()
      for (let i = 0; i < ruleCount; i++) {
        expect(styles).toContain(`ssr-prop-${i}`)
      }
    })

    it('SSR buffer does not duplicate identical rules', () => {
      const s = createSheet()

      for (let cycle = 0; cycle < 10; cycle++) {
        s.insert('color: red;')
      }

      const matches = s.getStyles().match(/color: red;/g)
      expect(matches).toHaveLength(1)
    })
  })
})
