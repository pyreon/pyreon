import { describe, expect, it } from "vitest"
import edge from "../styles/shorthands/edge"

const empty = {
  full: undefined,
  x: undefined,
  y: undefined,
  top: undefined,
  left: undefined,
  right: undefined,
  bottom: undefined,
}

const e = edge()

describe("edge", () => {
  it("returns null when no values provided", () => {
    expect(e("margin", empty)).toBeNull()
  })

  describe("full shorthand (all same)", () => {
    it("margin with single value", () => {
      expect(e("margin", { ...empty, full: 16 })).toBe("margin: 1rem;")
    })

    it("padding with single value", () => {
      expect(e("padding", { ...empty, full: 32 })).toBe("padding: 2rem;")
    })

    it("inset with single value", () => {
      expect(e("inset", { ...empty, full: 16 })).toBe("inset: 1rem;")
    })
  })

  describe("two-value shorthand", () => {
    it("top===bottom and right===left", () => {
      const result = e("margin", { ...empty, y: 16, x: 32 })
      expect(result).toBe("margin: 1rem 2rem;")
    })
  })

  describe("three-value shorthand", () => {
    it("top, right===left, bottom", () => {
      const result = e("padding", {
        ...empty,
        top: 16,
        right: 32,
        bottom: 48,
        left: 32,
      })
      expect(result).toBe("padding: 1rem 2rem 3rem;")
    })
  })

  describe("four-value shorthand", () => {
    it("all different sides", () => {
      const result = e("margin", {
        ...empty,
        top: 16,
        right: 32,
        bottom: 48,
        left: 64,
      })
      expect(result).toBe("margin: 1rem 2rem 3rem 4rem;")
    })
  })

  describe("x and y values", () => {
    it("x sets left and right", () => {
      const result = e("margin", { ...empty, x: 16 })
      expect(result).toBe("margin-left: 1rem;margin-right: 1rem;")
    })

    it("y sets top and bottom", () => {
      const result = e("margin", { ...empty, y: 16 })
      expect(result).toBe("margin-top: 1rem;margin-bottom: 1rem;")
    })
  })

  describe("individual sides override x/y/full", () => {
    it("top overrides y", () => {
      const result = e("margin", { ...empty, y: 16, top: 32, x: 16 })
      // t=32, r=16, b=16, l=16 → r===l so 3-value shorthand
      expect(result).toBe("margin: 2rem 1rem 1rem;")
    })

    it("left overrides x", () => {
      const result = e("padding", { ...empty, full: 16, left: 32 })
      expect(result).toBe("padding: 1rem 1rem 1rem 2rem;")
    })
  })

  describe("border-width uses px unit", () => {
    it("border-width with full value", () => {
      expect(e("border-width", { ...empty, full: 1 })).toBe("border-width: 1px;")
    })

    it("border-width individual sides", () => {
      const result = e("border-width", { ...empty, top: 1, bottom: 2 })
      expect(result).toBe("border-top-width: 1px;border-bottom-width: 2px;")
    })
  })

  describe("border-style does not use units", () => {
    it("border-style with full value", () => {
      expect(e("border-style", { ...empty, full: "solid" })).toBe("border-style: solid;")
    })

    it("border-style individual sides", () => {
      const result = e("border-style", { ...empty, top: "solid", bottom: "dashed" })
      expect(result).toBe("border-top-style: solid;border-bottom-style: dashed;")
    })
  })

  describe("border-color does not use units", () => {
    it("border-color with full value", () => {
      expect(e("border-color", { ...empty, full: "red" })).toBe("border-color: red;")
    })

    it("border-color individual sides", () => {
      const result = e("border-color", { ...empty, top: "red", left: "blue" })
      expect(result).toBe("border-top-color: red;border-left-color: blue;")
    })
  })

  describe("individual format when not all sides have values", () => {
    it("only top is set", () => {
      expect(e("margin", { ...empty, top: 16 })).toBe("margin-top: 1rem;")
    })

    it("only left and right are set", () => {
      const result = e("padding", { ...empty, left: 16, right: 32 })
      expect(result).toBe("padding-left: 1rem;padding-right: 2rem;")
    })

    it("inset individual sides", () => {
      const result = e("inset", { ...empty, top: 0, left: 16 })
      expect(result).toBe("top: 0;left: 1rem;")
    })
  })

  describe("zero values are valid", () => {
    it("zero full value", () => {
      expect(e("margin", { ...empty, full: 0 })).toBe("margin: 0;")
    })

    it("zero individual side", () => {
      expect(e("padding", { ...empty, top: 0 })).toBe("padding-top: 0;")
    })
  })

  describe("custom rootSize", () => {
    it("uses custom rootSize for conversion", () => {
      const eCustom = edge(10)
      expect(eCustom("margin", { ...empty, full: 20 })).toBe("margin: 2rem;")
    })
  })

  describe("string values", () => {
    it("passes through string values like auto", () => {
      expect(e("margin", { ...empty, full: "auto" })).toBe("margin: auto;")
    })
  })
})
