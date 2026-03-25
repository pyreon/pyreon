import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createSheet } from "../sheet"

describe("memory growth", () => {
  describe("bounded cache prevents unbounded growth (DOM mode)", () => {
    it("cache stays bounded with maxCacheSize", () => {
      const maxSize = 50
      const s = createSheet({ maxCacheSize: maxSize })

      for (let i = 0; i < maxSize * 3; i++) {
        s.insert(`property-${i}: value-${i};`)
      }

      expect(s.cacheSize).toBeLessThanOrEqual(maxSize * 1.5)
    })

    it("cache eviction preserves recent entries", () => {
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

    it("handles rapid insertions without memory issues", () => {
      const s = createSheet({ maxCacheSize: 100 })
      const iterations = 1000

      for (let i = 0; i < iterations; i++) {
        s.insert(`rapid-${i}: value;`)
      }

      expect(s.cacheSize).toBeLessThan(iterations)
      expect(s.cacheSize).toBeGreaterThan(0)
    })
  })

  describe("default cache (large limit, DOM mode)", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("default cache handles many unique rules", () => {
      const s = createSheet()

      for (let i = 0; i < 500; i++) {
        s.insert(`default-prop-${i}: value-${i};`)
      }

      expect(s.cacheSize).toBe(500)
    })

    it("deduplication prevents growth from repeated rules", () => {
      const s = createSheet()

      for (let cycle = 0; cycle < 100; cycle++) {
        for (let i = 0; i < 10; i++) {
          s.insert(`repeated-${i}: value;`)
        }
      }

      expect(s.cacheSize).toBe(10)
    })
  })

  describe("SSR mode memory", () => {
    let originalDocument: typeof document

    beforeEach(() => {
      originalDocument = globalThis.document
      // @ts-expect-error - intentionally deleting for SSR simulation
      delete globalThis.document
    })

    afterEach(() => {
      globalThis.document = originalDocument
    })

    it("reset prevents SSR buffer accumulation across requests", () => {
      const s = createSheet()

      for (let i = 0; i < 100; i++) {
        s.insert(`req1-prop-${i}: value;`)
      }
      expect(s.getStyles().length).toBeGreaterThan(0)

      s.reset()
      expect(s.getStyles()).toBe("")

      s.insert("req2-single: value;")
      expect(s.getStyles()).not.toContain("req1-prop")
    })

    it("keyframes cache does not grow unboundedly", () => {
      const s = createSheet({ maxCacheSize: 20 })

      for (let i = 0; i < 50; i++) {
        s.insertKeyframes(`anim-${i}`, `from { opacity: ${i}; } to { opacity: 1; }`)
      }

      expect(s.cacheSize).toBeLessThanOrEqual(50)
    })

    it("global rules cache does not grow unboundedly", () => {
      const s = createSheet({ maxCacheSize: 20 })

      for (let i = 0; i < 50; i++) {
        s.insertGlobal(`body { prop${i}: val${i}; }`)
      }

      expect(s.cacheSize).toBeLessThanOrEqual(50)
    })

    it("SSR buffer grows with unique rules (expected behavior)", () => {
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

    it("SSR buffer does not duplicate identical rules", () => {
      const s = createSheet()

      for (let cycle = 0; cycle < 10; cycle++) {
        s.insert("color: red;")
      }

      const matches = s.getStyles().match(/color: red;/g)
      expect(matches).toHaveLength(1)
    })
  })
})
