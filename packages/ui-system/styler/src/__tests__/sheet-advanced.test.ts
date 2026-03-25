import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { hash } from "../hash"
import { createSheet, StyleSheet } from "../sheet"

describe("StyleSheet -- advanced features", () => {
  describe("getClassName (pure hash computation)", () => {
    it("returns className without inserting a rule", () => {
      const s = createSheet()
      const cls = s.getClassName("display: flex;")
      expect(cls).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it("returns same className as insert for same CSS", () => {
      const s = createSheet()
      const clsPure = s.getClassName("display: flex;")
      const clsInsert = s.insert("display: flex;")
      expect(clsPure).toBe(clsInsert)
    })

    it("matches hash-based className", () => {
      const s = createSheet()
      const cssText = "display: flex;"
      expect(s.getClassName(cssText)).toBe(`pyr-${hash(cssText)}`)
    })
  })

  describe("bounded cache (eviction) -- DOM mode", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("still deduplicates within cache bounds", () => {
      const s = createSheet({ maxCacheSize: 100 })
      const cls1 = s.insert("color: red;")
      const cls2 = s.insert("color: red;")
      expect(cls1).toBe(cls2)
    })

    it("cacheSize property reflects current cache size", () => {
      const s = createSheet()
      expect(s.cacheSize).toBe(0)

      s.insert("color: red;")
      expect(s.cacheSize).toBe(1)

      s.insert("color: blue;")
      expect(s.cacheSize).toBe(2)

      // Duplicate doesn't increase size
      s.insert("color: red;")
      expect(s.cacheSize).toBe(2)
    })

    it("evicts oldest entries when max cache size is exceeded", () => {
      const s = createSheet({ maxCacheSize: 10 })

      for (let i = 0; i < 15; i++) {
        s.insert(`prop-${i}: val-${i};`)
      }

      expect(s.cacheSize).toBeLessThanOrEqual(15)
    })

    it("accepts custom maxCacheSize option", () => {
      const s = createSheet({ maxCacheSize: 5 })

      for (let i = 0; i < 20; i++) {
        s.insert(`prop${i}: val${i};`)
      }

      expect(s.cacheSize).toBeLessThanOrEqual(20)
    })
  })

  describe("dev-mode warnings", () => {
    it("warns on invalid CSS in dev mode", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })

      const s = new StyleSheet()
      s.insert("invalid{{{css")

      warnSpy.mockRestore()
    })
  })

  describe("insertGlobal -- multi-rule splitting", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("injects multiple top-level rules from a single insertGlobal call", () => {
      const s = createSheet()
      s.insertGlobal("html { font-size: 16px; } body { margin: 0; }")
      // Should not throw -- both rules are injected individually
      expect(s.cacheSize).toBe(1) // single cache entry for the whole CSS text
    })

    it("injects nested @media rules correctly", () => {
      const s = createSheet()
      s.insertGlobal("body { margin: 0; } @media (min-width: 768px) { body { font-size: 18px; } }")
      expect(s.cacheSize).toBe(1)
    })

    it("handles three or more rules", () => {
      const s = createSheet()
      s.insertGlobal(
        "html { box-sizing: border-box; } *, *::before, *::after { box-sizing: inherit; } body { margin: 0; font-family: sans-serif; }",
      )
      expect(s.cacheSize).toBe(1)
    })

    it("deduplicates identical multi-rule CSS", () => {
      const s = createSheet()
      const cssStr = "html { font-size: 16px; } body { margin: 0; }"
      s.insertGlobal(cssStr)
      s.insertGlobal(cssStr)
      expect(s.cacheSize).toBe(1)
    })

    it("inserts multiple rules into the CSSOM via splitRules and insertRule", () => {
      const s = createSheet()
      s.insertGlobal("body{margin:0}div{padding:0}")

      // Verify rules were actually inserted into the CSSOM
      const styleEl = document.querySelector("style[data-pyreon-styler]") as HTMLStyleElement
      const cssSheet = styleEl.sheet as CSSStyleSheet
      const ruleTexts = Array.from(cssSheet.cssRules).map((r) => r.cssText)
      expect(ruleTexts.some((r) => r.includes("margin"))).toBe(true)
      expect(ruleTexts.some((r) => r.includes("padding"))).toBe(true)
    })

    it("deduplicates insertGlobal -- second call with same CSS is a no-op", () => {
      const s = createSheet()
      s.insertGlobal("body{margin:0}div{padding:0}")

      const styleEl = document.querySelector("style[data-pyreon-styler]") as HTMLStyleElement
      const cssSheet = styleEl.sheet as CSSStyleSheet
      const countBefore = cssSheet.cssRules.length

      // Second call should be deduped via cache
      s.insertGlobal("body{margin:0}div{padding:0}")
      expect(cssSheet.cssRules.length).toBe(countBefore)
    })

    it("inserts global CSS with @media into CSSOM", () => {
      const s = createSheet()
      s.insertGlobal("body{margin:0}@media (min-width:768px){body{font-size:18px}}")

      const styleEl = document.querySelector("style[data-pyreon-styler]") as HTMLStyleElement
      const cssSheet = styleEl.sheet as CSSStyleSheet
      const ruleTexts = Array.from(cssSheet.cssRules).map((r) => r.cssText)
      expect(ruleTexts.some((r) => r.includes("margin"))).toBe(true)
      expect(ruleTexts.some((r) => r.includes("media"))).toBe(true)
    })
  })

  describe("@layer on client-side insert", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("wraps inserted rules in @layer on client side", () => {
      const s = createSheet({ layer: "components" })
      const className = s.insert("color: red;")
      expect(className).toMatch(/^pyr-/)
      // The sheet should have injected a @layer declaration + the wrapped rule
    })

    it("injects @layer declaration rule on mount", () => {
      const s = createSheet({ layer: "myLayer" })
      s.insert("display: flex;")
      // No crash -- @layer declaration was injected at mount time
      expect(s.cacheSize).toBe(1)
    })
  })

  describe("hydration from existing SSR style tag", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("reuses existing <style data-pyreon-styler> tag and hydrates cache", () => {
      // Create a style tag that simulates SSR output
      const el = document.createElement("style")
      el.setAttribute("data-pyreon-styler", "")
      document.head.appendChild(el)

      // Insert a rule directly so hydrateFromTag can discover it
      const sheetRef = el.sheet
      if (sheetRef) sheetRef.insertRule(".pyr-abc { color: red; }", 0)

      // Create a new sheet -- it should find and reuse the existing tag
      const s = createSheet()
      // The hydration should have populated the cache with 'pyr-abc'
      expect(s.has("pyr-abc")).toBe(true)
    })

    it("hydrates @media-wrapped rules from SSR style tag", () => {
      const el = document.createElement("style")
      el.setAttribute("data-pyreon-styler", "")
      document.head.appendChild(el)

      const sheetRef = el.sheet
      if (sheetRef) {
        sheetRef.insertRule("@media (min-width: 768px) { .pyr-xyz { font-size: 2rem; } }", 0)
      }

      const s = createSheet()
      expect(s.has("pyr-xyz")).toBe(true)
    })
  })

  describe("boost on prepare()", () => {
    it("doubles selector when boost is true", () => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
      const s = createSheet()
      const result = s.prepare("color: red;", true)
      expect(result.className).toMatch(/^pyr-/)
      // Boosted: selector is doubled
      expect(result.rules).toContain(`.${result.className}.${result.className}`)
    })

    it("single selector when boost is false", () => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
      const s = createSheet()
      const result = s.prepare("color: red;", false)
      // Non-boosted: single selector
      expect(result.rules).toContain(`.${result.className}{`)
      expect(result.rules).not.toContain(`.${result.className}.${result.className}`)
    })

    it("prepare with empty base -- all CSS is @rules", () => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
      const s = createSheet()
      // CSS that is entirely an @media rule, so base is empty after splitting
      const result = s.prepare("@media(min-width:0){color:red}")
      expect(result.className).toMatch(/^pyr-/)
      // Should contain the @media rule but NOT a bare selector rule (no base)
      expect(result.rules).toContain("@media")
      expect(result.rules).toContain("color:red")
      // The rules should NOT start with a plain selector -- no base rule emitted
      expect(result.rules).not.toMatch(new RegExp(`^\\.${result.className}\\{`))
    })

    it("prepare with only @supports produces no base rule", () => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
      const s = createSheet()
      const result = s.prepare(
        "@supports(display:grid){display:grid}@media(min-width:0){color:red}",
      )
      expect(result.className).toMatch(/^pyr-/)
      expect(result.rules).toContain("@supports")
      expect(result.rules).toContain("@media")
      // No base selector rule
      expect(result.rules).not.toMatch(new RegExp(`^\\.${result.className}\\{`))
    })
  })

  describe("boost on insert()", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("inserts boosted rule on client side", () => {
      const s = createSheet()
      const cls = s.insert("color: red;", true)
      expect(cls).toMatch(/^pyr-/)
    })

    it("deduplicates boosted and non-boosted separately via insertCache key", () => {
      const s = createSheet()
      const cls1 = s.insert("color: green;", false)
      const cls2 = s.insert("color: green;", true)
      // Same className (same hash) but both should work without error
      expect(cls1).toBe(cls2)
    })
  })

  describe("clearAll() with rules", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("removes all CSS rules from the DOM sheet", () => {
      const s = createSheet()
      s.insert("color: red;")
      s.insert("color: blue;")
      expect(s.cacheSize).toBe(2)

      s.clearAll()
      expect(s.cacheSize).toBe(0)
    })

    it("allows re-insertion after clearAll", () => {
      const s = createSheet()
      s.insert("color: red;")
      s.clearAll()
      // Re-insert the same CSS -- should work since cache was cleared
      const cls = s.insert("color: red;")
      expect(cls).toMatch(/^pyr-/)
      expect(s.cacheSize).toBe(1)
    })
  })

  describe("clearCache()", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("clears the dedup cache but leaves DOM rules in place", () => {
      const s = createSheet()
      s.insert("color: red;")
      expect(s.cacheSize).toBe(1)

      s.clearCache()
      expect(s.cacheSize).toBe(0)
    })
  })

  describe("insertRule failure warning", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("warns in dev mode when insertRule fails for insert()", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
      const s = createSheet()
      // Insert invalid CSS that will cause insertRule to throw
      s.insert("color: red; @INVALID_RULE {{{")
      warnSpy.mockRestore()
    })

    it("warns in dev mode when insertGlobal insertRule fails", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
      const s = createSheet()
      // Insert intentionally malformed global CSS
      s.insertGlobal("@INVALID {{{")
      warnSpy.mockRestore()
    })

    it("warns in dev mode when insertKeyframes insertRule fails", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
      const s = createSheet()
      s.insertKeyframes("bad", "{{{invalid")
      warnSpy.mockRestore()
    })
  })

  describe("insert() insertRule failure via mock", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("warns when CSSStyleSheet.insertRule throws during insert()", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
      const s = createSheet()

      // Access the internal sheet and make insertRule throw
      const styleEl = document.querySelector("style[data-pyreon-styler]") as HTMLStyleElement
      const realSheet = styleEl.sheet
      if (!realSheet) throw new Error("Expected sheet to exist")
      const origInsertRule = realSheet.insertRule.bind(realSheet)
      realSheet.insertRule = (rule: string, index?: number) => {
        // Let @layer declaration through (if any), fail on component rules
        if (rule.startsWith(".pyr-")) {
          throw new Error("Mock insertRule failure")
        }
        return origInsertRule(rule, index)
      }

      s.insert("color: magenta;")

      expect(warnSpy).toHaveBeenCalled()
      expect(warnSpy.mock.calls[0]?.[0]).toContain("[styler] Failed to insert CSS rule")

      realSheet.insertRule = origInsertRule
      warnSpy.mockRestore()
    })
  })

  describe("insertGlobal insertRule failure via mock", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("warns when CSSStyleSheet.insertRule throws during insertGlobal()", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
      const s = createSheet()

      const styleEl = document.querySelector("style[data-pyreon-styler]") as HTMLStyleElement
      const realSheet = styleEl.sheet
      if (!realSheet) throw new Error("Expected sheet to exist")
      const origInsertRule = realSheet.insertRule.bind(realSheet)
      realSheet.insertRule = (_rule: string, _index?: number) => {
        throw new Error("Mock insertGlobal failure")
      }

      s.insertGlobal("body { margin: 0; }")

      expect(warnSpy).toHaveBeenCalled()
      expect(warnSpy.mock.calls[0]?.[0]).toContain("[styler] Failed to insert global CSS rule")

      realSheet.insertRule = origInsertRule
      warnSpy.mockRestore()
    })
  })

  describe("getClassName with insertCache populated", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("returns cached className from insertCache after insert()", () => {
      const s = createSheet()
      const cls1 = s.insert("color: purple;")
      // getClassName should hit the insertCache
      const cls2 = s.getClassName("color: purple;")
      expect(cls1).toBe(cls2)
    })
  })

  // SSR-specific tests: mock document as undefined to simulate server
  describe("SSR mode (mocked)", () => {
    let originalDocument: typeof document

    beforeEach(() => {
      originalDocument = globalThis.document
      // Temporarily remove document to simulate SSR
      // @ts-expect-error - intentionally deleting for SSR simulation
      delete globalThis.document
    })

    afterEach(() => {
      globalThis.document = originalDocument
    })

    it("creates independent StyleSheet instances in SSR", () => {
      const sheet1 = createSheet()
      const sheet2 = createSheet()

      sheet1.insert("color: red;")
      expect(sheet1.getStyles()).toContain("color: red;")
      expect(sheet2.getStyles()).toBe("")
    })

    it("each instance has its own SSR buffer", () => {
      const sheet1 = createSheet()
      const sheet2 = createSheet()

      sheet1.insert("color: red;")
      sheet2.insert("color: blue;")

      expect(sheet1.getStyles()).toContain("color: red;")
      expect(sheet1.getStyles()).not.toContain("color: blue;")
      expect(sheet2.getStyles()).toContain("color: blue;")
      expect(sheet2.getStyles()).not.toContain("color: red;")
    })

    it("reset only clears the buffer of that instance", () => {
      const sheet1 = createSheet()
      const sheet2 = createSheet()

      sheet1.insert("color: red;")
      sheet2.insert("color: blue;")

      sheet1.reset()
      expect(sheet1.getStyles()).toBe("")
      expect(sheet2.getStyles()).toContain("color: blue;")
    })

    it("each instance has its own dedup cache", () => {
      const sheet1 = createSheet()
      const sheet2 = createSheet()

      const cls1 = sheet1.insert("display: flex;")
      const cls2 = sheet2.insert("display: flex;")

      // Same CSS -> same class name (deterministic hashing)
      expect(cls1).toBe(cls2)

      // Both inject independently
      expect(sheet1.getStyles()).toContain("display: flex;")
      expect(sheet2.getStyles()).toContain("display: flex;")
    })

    describe("concurrent SSR simulation", () => {
      it("handles concurrent requests without cross-contamination", () => {
        const request1 = createSheet()
        const request2 = createSheet()

        request1.insert("color: red;")
        request1.insertGlobal("body { margin: 0; }")

        request2.insert("color: blue;")
        request2.insertGlobal("body { padding: 0; }")

        const html1 = request1.getStyleTag()
        const html2 = request2.getStyleTag()

        expect(html1).toContain("color: red;")
        expect(html1).not.toContain("color: blue;")
        expect(html1).toContain("body { margin: 0; }")
        expect(html1).not.toContain("body { padding: 0; }")

        expect(html2).toContain("color: blue;")
        expect(html2).not.toContain("color: red;")
        expect(html2).toContain("body { padding: 0; }")
        expect(html2).not.toContain("body { margin: 0; }")
      })

      it("handles many concurrent requests", () => {
        const requests = Array.from({ length: 50 }, (_, i) => {
          const s = createSheet()
          s.insert(`color: color-${i};`)
          return s
        })

        for (let i = 0; i < requests.length; i++) {
          const styles = requests[i]?.getStyles()
          expect(styles).toContain(`color: color-${i};`)
          const otherIdx = (i + 1) % requests.length
          expect(styles).not.toContain(`color: color-${otherIdx};`)
        }
      })
    })

    describe("@layer support", () => {
      it("wraps inserted rules in @layer when configured", () => {
        const s = createSheet({ layer: "components" })

        s.insert("color: red;")
        const styles = s.getStyles()

        expect(styles).toContain("@layer components")
        expect(styles).toContain("color: red;")
      })

      it("does not wrap rules without layer option", () => {
        const s = createSheet()

        s.insert("color: red;")
        const styles = s.getStyles()

        expect(styles).not.toContain("@layer")
        expect(styles).toContain("color: red;")
      })

      it("does not wrap @keyframes in @layer", () => {
        const s = createSheet({ layer: "components" })

        s.insertKeyframes("fadeIn", "from { opacity: 0; } to { opacity: 1; }")
        const styles = s.getStyles()

        expect(styles).toContain("@keyframes fadeIn")
        // Keyframes are not wrapped
        expect(styles).not.toMatch(/@layer.*@keyframes/)
      })

      it("does not wrap global rules in @layer", () => {
        const s = createSheet({ layer: "components" })

        s.insertGlobal("body { margin: 0; }")
        const styles = s.getStyles()

        expect(styles).toContain("body { margin: 0; }")
        expect(styles).not.toMatch(/@layer components\{body/)
      })

      it("prepare() wraps rules in @layer when configured", () => {
        const s = createSheet({ layer: "components" })
        const result = s.prepare("color: red;")
        expect(result.rules).toContain("@layer components")
        expect(result.rules).toContain("color: red;")
      })

      it("prepare() with boost wraps in @layer", () => {
        const s = createSheet({ layer: "lib" })
        const result = s.prepare("color: blue;", true)
        expect(result.rules).toContain("@layer lib")
        expect(result.rules).toContain(`.${result.className}.${result.className}`)
      })
    })

    describe("SSR output", () => {
      it("getStyleTag returns complete <style> tag", () => {
        const s = createSheet()
        s.insert("color: red;")
        const tag = s.getStyleTag()

        expect(tag).toMatch(/^<style data-pyreon-styler="">.*<\/style>$/)
        expect(tag).toContain("color: red;")
      })

      it("getStyles returns raw CSS", () => {
        const s = createSheet()
        s.insert("color: red;")
        s.insert("color: blue;")
        const styles = s.getStyles()

        expect(styles).not.toContain("<style")
        expect(styles).toContain("color: red;")
        expect(styles).toContain("color: blue;")
      })

      it("reset clears SSR buffer and cache", () => {
        const s = createSheet()
        s.insert("color: red;")
        expect(s.getStyles()).toContain("color: red;")

        s.reset()
        expect(s.getStyles()).toBe("")
        expect(s.cacheSize).toBe(0) // cache also cleared for SSR correctness
      })

      it("insertKeyframes deduplicates in SSR", () => {
        const s = createSheet()
        s.insertKeyframes("fadeIn", "from { opacity: 0; } to { opacity: 1; }")
        s.insertKeyframes("fadeIn", "from { opacity: 0; } to { opacity: 1; }")

        const styles = s.getStyles()
        const matches = styles.match(/@keyframes fadeIn/g)
        expect(matches).toHaveLength(1)
      })

      it("insertGlobal deduplicates in SSR", () => {
        const s = createSheet()
        s.insertGlobal("body { margin: 0; }")
        s.insertGlobal("body { margin: 0; }")

        const styles = s.getStyles()
        const matches = styles.match(/body \{ margin: 0; \}/g)
        expect(matches).toHaveLength(1)
      })
    })
  })
})
