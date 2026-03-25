import { describe, expect, it } from "vitest"
import camelToKebab from "../styles/styles/camelToKebab"

describe("camelToKebab", () => {
  it("converts camelCase to kebab-case", () => {
    expect(camelToKebab("backgroundColor")).toBe("background-color")
  })

  it("converts multiple uppercase letters", () => {
    expect(camelToKebab("borderTopLeftRadius")).toBe("border-top-left-radius")
  })

  it("returns lowercase strings unchanged", () => {
    expect(camelToKebab("color")).toBe("color")
  })

  it("returns empty string for empty input", () => {
    expect(camelToKebab("")).toBe("")
  })

  it("handles single uppercase letter", () => {
    expect(camelToKebab("A")).toBe("-a")
  })

  it("handles leading lowercase", () => {
    expect(camelToKebab("fontSize")).toBe("font-size")
  })

  it("handles consecutive uppercase letters individually", () => {
    expect(camelToKebab("msOverflowStyle")).toBe("ms-overflow-style")
  })

  it("handles boxSizing", () => {
    expect(camelToKebab("boxSizing")).toBe("box-sizing")
  })

  it("handles flexDirection", () => {
    expect(camelToKebab("flexDirection")).toBe("flex-direction")
  })

  it("handles justifyContent", () => {
    expect(camelToKebab("justifyContent")).toBe("justify-content")
  })
})
