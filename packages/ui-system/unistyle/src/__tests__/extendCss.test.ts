import { describe, expect, it } from "vitest"
import extendCss from "../styles/extendCss"

describe("extendCss", () => {
  it("returns empty string for null input", () => {
    expect(extendCss(null)).toBe("")
  })

  it("returns empty string for undefined input", () => {
    expect(extendCss(undefined)).toBe("")
  })

  it("returns the string as-is for string input", () => {
    expect(extendCss("color: red;")).toBe("color: red;")
  })

  it("returns empty string for empty string input", () => {
    expect(extendCss("")).toBe("")
  })

  it("calls function with simpleCss tagged template and returns result", () => {
    const result = extendCss((css) => css`color: red; font-size: 16px;`)
    expect(result).toBe("color: red; font-size: 16px;")
  })

  it("handles function with interpolated values", () => {
    const size = 16
    const result = extendCss((css) => css`font-size: ${size}px;`)
    expect(result).toBe("font-size: 16px;")
  })

  it("handles function with multiple interpolated values", () => {
    const color = "red"
    const size = 14
    const result = extendCss((css) => css`color: ${color}; font-size: ${size}px;`)
    expect(result).toBe("color: red; font-size: 14px;")
  })

  it("handles function with null/undefined interpolated values as empty string", () => {
    const nullVal = null as string | null
    const undefVal = undefined as string | undefined
    const result = extendCss((css) => css`color: ${nullVal}; font-size: ${undefVal}px;`)
    expect(result).toBe("color: ; font-size: px;")
  })
})
