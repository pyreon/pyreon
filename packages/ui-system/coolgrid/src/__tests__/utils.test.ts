import { describe, expect, it } from "vitest"
import { getContainerWidth } from "../Container/utils"
import { hasValue, hasWidth, isNumber, isVisible, omitCtxKeys } from "../utils"

describe("isNumber", () => {
  it("returns true for finite numbers", () => {
    expect(isNumber(0)).toBe(true)
    expect(isNumber(1)).toBe(true)
    expect(isNumber(-1)).toBe(true)
    expect(isNumber(3.14)).toBe(true)
  })

  it("returns false for non-finite values", () => {
    expect(isNumber(Infinity)).toBe(false)
    expect(isNumber(-Infinity)).toBe(false)
    expect(isNumber(NaN)).toBe(false)
  })

  it("returns false for non-number types", () => {
    expect(isNumber(null)).toBe(false)
    expect(isNumber(undefined)).toBe(false)
    expect(isNumber("5")).toBe(false)
    expect(isNumber(true)).toBe(false)
  })
})

describe("hasValue", () => {
  it("returns true for positive finite numbers", () => {
    expect(hasValue(1)).toBe(true)
    expect(hasValue(12)).toBe(true)
    expect(hasValue(0.5)).toBe(true)
  })

  it("returns false for zero", () => {
    expect(hasValue(0)).toBe(false)
  })

  it("returns false for negative numbers", () => {
    expect(hasValue(-1)).toBe(false)
  })

  it("returns false for non-numbers", () => {
    expect(hasValue(null)).toBe(false)
    expect(hasValue(undefined)).toBe(false)
    expect(hasValue("5")).toBe(false)
  })
})

describe("isVisible", () => {
  it("returns true for positive numbers", () => {
    expect(isVisible(1)).toBe(true)
    expect(isVisible(12)).toBe(true)
  })

  it("returns true for negative numbers", () => {
    expect(isVisible(-1)).toBe(true)
  })

  it("returns false for zero", () => {
    expect(isVisible(0)).toBe(false)
  })

  it("returns true for undefined (default visibility)", () => {
    expect(isVisible(undefined)).toBe(true)
  })

  it("returns false for non-number truthy values", () => {
    expect(isVisible("5")).toBe(false)
    expect(isVisible(null)).toBe(false)
  })
})

describe("hasWidth", () => {
  it("returns true when both size and columns are positive numbers", () => {
    expect(hasWidth(6, 12)).toBe(true)
    expect(hasWidth(1, 1)).toBe(true)
  })

  it("returns false when size is 0", () => {
    expect(hasWidth(0, 12)).toBe(false)
  })

  it("returns false when columns is 0", () => {
    expect(hasWidth(6, 0)).toBe(false)
  })

  it("returns false when either is not a number", () => {
    expect(hasWidth(null, 12)).toBe(false)
    expect(hasWidth(6, null)).toBe(false)
    expect(hasWidth(undefined, undefined)).toBe(false)
  })
})

describe("omitCtxKeys", () => {
  it("strips context keys from props", () => {
    const props = {
      columns: 12,
      size: 6,
      gap: 16,
      padding: 4,
      gutter: 8,
      colCss: "color: red;",
      colComponent: () => null,
      rowCss: "color: blue;",
      rowComponent: () => null,
      contentAlignX: "center",
      className: "my-class",
      id: "my-id",
    }
    const result = omitCtxKeys(props)
    expect(result).toEqual({
      className: "my-class",
      id: "my-id",
    })
  })

  it("returns all props when no context keys present", () => {
    const props = { className: "test", style: "color: red;" }
    const result = omitCtxKeys(props)
    expect(result).toEqual(props)
  })
})

describe("getContainerWidth", () => {
  it("returns width from props", () => {
    const result = getContainerWidth({ width: { xs: 600 } }, {})
    expect(result).toEqual({ xs: 600 })
  })

  it("falls back to theme.grid.container", () => {
    const result = getContainerWidth({}, { grid: { container: { xs: "100%" } } })
    expect(result).toEqual({ xs: "100%" })
  })

  it("falls back to theme.coolgrid.container", () => {
    const result = getContainerWidth({}, { coolgrid: { container: { md: 720 } } })
    expect(result).toEqual({ md: 720 })
  })

  it("returns undefined when nothing matches", () => {
    const result = getContainerWidth({}, {})
    expect(result).toBeFalsy()
  })
})
