import { describe, expect, it } from "vitest"
import { css } from "../css"
import { CSSResult } from "../resolve"

describe("css", () => {
  it("returns a CSSResult instance", () => {
    const result = css`color: red;`
    expect(result).toBeInstanceOf(CSSResult)
  })

  it("captures template strings", () => {
    const result = css`color: red;`
    expect(result.strings[0]).toBe("color: red;")
  })

  it("captures interpolation values", () => {
    const color = "blue"
    const result = css`color: ${color};`
    expect(result.values).toEqual(["blue"])
  })

  it("captures function interpolations without calling them", () => {
    const fn = () => "red"
    const result = css`color: ${fn};`
    expect(result.values[0]).toBe(fn)
    expect(typeof result.values[0]).toBe("function")
  })

  it("works when called as a regular function", () => {
    const strings = Object.assign(["color: ", ";"], {
      raw: ["color: ", ";"],
    }) as TemplateStringsArray
    const result = css(strings, "red")
    expect(result).toBeInstanceOf(CSSResult)
    expect(result.values).toEqual(["red"])
  })

  it("supports nesting css results", () => {
    const inner = css`color: red;`
    const outer = css`${inner} display: flex;`
    expect(outer.values[0]).toBeInstanceOf(CSSResult)
  })

  it("handles multiple interpolations", () => {
    const result = css`color: ${"red"}; font-size: ${16}px;`
    expect(result.values).toEqual(["red", 16])
    expect(result.strings.length).toBe(3)
  })

  it("handles null/undefined/boolean interpolations lazily", () => {
    const n = null
    const u = undefined
    const f = false
    const t = true
    const result = css`a${n}b${u}c${f}d${t}e`
    expect(result.values).toEqual([null, undefined, false, true])
  })

  it("captures numeric interpolations", () => {
    const result = css`flex: ${1};`
    expect(result.values[0]).toBe(1)
  })

  it("empty template returns CSSResult with one empty string", () => {
    const result = css``
    expect(result).toBeInstanceOf(CSSResult)
    expect(result.strings.length).toBe(1)
    expect(result.values.length).toBe(0)
  })
})
