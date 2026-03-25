import { describe, expect, it } from "vitest"
import { INLINE_ELEMENTS_FLEX_FIX } from "../helpers/Wrapper/constants"
import { isWebFixNeeded } from "../helpers/Wrapper/utils"

describe("Wrapper utils", () => {
  describe("isWebFixNeeded", () => {
    it("returns true for button", () => {
      expect(isWebFixNeeded("button")).toBe(true)
    })

    it("returns true for fieldset", () => {
      expect(isWebFixNeeded("fieldset")).toBe(true)
    })

    it("returns true for legend", () => {
      expect(isWebFixNeeded("legend")).toBe(true)
    })

    it("returns false for div", () => {
      expect(isWebFixNeeded("div")).toBe(false)
    })

    it("returns false for span", () => {
      expect(isWebFixNeeded("span")).toBe(false)
    })

    it("returns false for section", () => {
      expect(isWebFixNeeded("section")).toBe(false)
    })

    it("returns false for undefined", () => {
      expect(isWebFixNeeded(undefined)).toBe(false)
    })

    it("returns false for empty string", () => {
      expect(isWebFixNeeded("")).toBe(false)
    })

    it("returns false for input", () => {
      expect(isWebFixNeeded("input")).toBe(false)
    })

    it("returns false for form", () => {
      expect(isWebFixNeeded("form")).toBe(false)
    })
  })

  describe("INLINE_ELEMENTS_FLEX_FIX", () => {
    it("contains button", () => {
      expect(INLINE_ELEMENTS_FLEX_FIX.button).toBe(true)
    })

    it("contains fieldset", () => {
      expect(INLINE_ELEMENTS_FLEX_FIX.fieldset).toBe(true)
    })

    it("contains legend", () => {
      expect(INLINE_ELEMENTS_FLEX_FIX.legend).toBe(true)
    })

    it("only has 3 entries", () => {
      expect(Object.keys(INLINE_ELEMENTS_FLEX_FIX)).toHaveLength(3)
    })
  })
})
