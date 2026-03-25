import { afterEach, describe, expect, it } from "vitest"
import { css } from "../css"
import { sheet } from "../sheet"
import { useCSS } from "../useCSS"

describe("useCSS", () => {
  afterEach(() => {
    sheet.clearAll()
  })

  describe("basic usage", () => {
    it("returns a className string for static CSS", () => {
      const template = css`display: flex;`
      const result = useCSS(template)
      expect(typeof result).toBe("string")
      expect(result).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it("returns different classNames for different CSS", () => {
      const template1 = css`display: flex;`
      const template2 = css`display: block;`

      const r1 = useCSS(template1)
      const r2 = useCSS(template2)

      expect(r1).toMatch(/^pyr-/)
      expect(r2).toMatch(/^pyr-/)
      expect(r1).not.toBe(r2)
    })

    it("returns empty string for empty CSS", () => {
      const template = css``
      const result = useCSS(template)
      expect(result).toBe("")
    })

    it("returns empty string for whitespace-only CSS", () => {
      const template = css`   `
      const result = useCSS(template)
      expect(result).toBe("")
    })
  })

  describe("dynamic values", () => {
    it("works with static interpolation values", () => {
      const color = "red"
      const template = css`color: ${color};`
      const result = useCSS(template)
      expect(result).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it("works with function interpolations resolved via props", () => {
      const template = css`color: ${(p: any) => p.color};`
      const result = useCSS(template, { color: "blue" })
      expect(result).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it("different prop values produce different classNames", () => {
      const template = css`color: ${(p: any) => p.color};`

      const r1 = useCSS(template, { color: "red" })
      const r2 = useCSS(template, { color: "green" })

      expect(r1).not.toBe(r2)
    })
  })

  describe("caching", () => {
    it("same CSS returns same className on repeated calls", () => {
      const template = css`display: flex;`
      const cls1 = useCSS(template)
      const cls2 = useCSS(template)
      expect(cls1).toBe(cls2)
    })

    it("same dynamic CSS with same props returns same className", () => {
      const template = css`color: ${(p: any) => p.color};`
      const cls1 = useCSS(template, { color: "red" })
      const cls2 = useCSS(template, { color: "red" })
      expect(cls1).toBe(cls2)
    })
  })

  describe("cache hit path", () => {
    it("reuses cached className with identical resolved CSS", () => {
      const template = css`color: ${(p: any) => p.color};`
      const cls1 = useCSS(template, { color: "red" })
      const cls2 = useCSS(template, { color: "red" })
      expect(cls1).toBe(cls2)
      expect(cls1).toMatch(/^pyr-/)
    })

    it("updates className when resolved CSS changes", () => {
      const template = css`color: ${(p: any) => p.color};`
      const cls1 = useCSS(template, { color: "red" })
      const cls2 = useCSS(template, { color: "blue" })
      expect(cls1).not.toBe(cls2)
    })
  })

  describe("boost parameter", () => {
    it("does not throw when boost is true", () => {
      const template = css`display: flex;`
      const result = useCSS(template, undefined, true)
      expect(result).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it("does not throw when boost is false", () => {
      const template = css`display: flex;`
      const result = useCSS(template, undefined, false)
      expect(result).toMatch(/^pyr-[0-9a-z]+$/)
    })
  })

  describe("without theme and without props", () => {
    it("uses empty object when no props and no theme", () => {
      const template = css`display: flex;`
      const result = useCSS(template)
      expect(result).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it("handles dynamic template without theme or props", () => {
      const template = css`color: ${(p: any) => p.color ?? "red"};`
      const result = useCSS(template, undefined)
      expect(result).toMatch(/^pyr-/)
    })
  })

  describe("empty CSS from dynamic resolution", () => {
    it("returns empty className when dynamic CSS resolves to empty", () => {
      const template = css`${(p: any) => (p.color ? `color: ${p.color};` : "")}`

      // First call: non-empty CSS
      const cls1 = useCSS(template, { color: "red" })
      expect(cls1).toMatch(/^pyr-/)

      // Second call: empty CSS
      const cls2 = useCSS(template, { color: undefined })
      expect(cls2).toBe("")
    })
  })
})
