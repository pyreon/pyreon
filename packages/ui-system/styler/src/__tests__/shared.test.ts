import { describe, expect, it } from "vitest"
import { css } from "../css"
import { CSSResult } from "../resolve"
import { isDynamic } from "../shared"

describe("isDynamic", () => {
  it("returns true for function values", () => {
    expect(isDynamic(() => "red")).toBe(true)
  })

  it("returns false for string values", () => {
    expect(isDynamic("color: red;")).toBe(false)
  })

  it("returns false for number values", () => {
    expect(isDynamic(42)).toBe(false)
  })

  it("returns false for null and undefined", () => {
    expect(isDynamic(null)).toBe(false)
    expect(isDynamic(undefined)).toBe(false)
  })

  it("returns false for boolean values", () => {
    expect(isDynamic(true)).toBe(false)
    expect(isDynamic(false)).toBe(false)
  })

  it("returns true for arrays containing functions", () => {
    expect(isDynamic(["a", () => "b"])).toBe(true)
  })

  it("returns false for arrays of static values", () => {
    expect(isDynamic(["a", "b", 42])).toBe(false)
  })

  it("returns true for CSSResult with dynamic values", () => {
    const result = css`color: ${() => "red"};`
    expect(isDynamic(result)).toBe(true)
  })

  it("returns false for CSSResult with only static values", () => {
    const result = css`color: ${"red"};`
    expect(isDynamic(result)).toBe(false)
  })

  it("returns true for nested dynamic CSSResult", () => {
    const inner = css`color: ${() => "red"};`
    const outer = css`${inner}`
    expect(isDynamic(outer)).toBe(true)
  })

  it("returns false for nested static CSSResult", () => {
    const inner = css`color: red;`
    const outer = css`${inner}`
    expect(isDynamic(outer)).toBe(false)
  })

  it("detects deeply nested dynamic values", () => {
    const deep = css`color: ${() => "red"};`
    const mid = css`${deep}`
    const outer = css`${mid}`
    expect(isDynamic(outer)).toBe(true)
  })

  it("handles arrays inside CSSResult", () => {
    const result = new CSSResult(
      Object.assign(["", ""], { raw: ["", ""] }) as TemplateStringsArray,
      [["a", () => "b"]],
    )
    expect(isDynamic(result)).toBe(true)
  })
})
