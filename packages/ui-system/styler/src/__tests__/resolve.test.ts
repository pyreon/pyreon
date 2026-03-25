import { describe, expect, it } from "vitest"
import { css } from "../css"
import { CSSResult, normalizeCSS, resolve, resolveValue } from "../resolve"

// Helper to create a TemplateStringsArray
const tsa = (strings: readonly string[]): TemplateStringsArray => {
  const arr = [...strings] as string[] & { raw: readonly string[] }
  arr.raw = strings
  return arr
}

describe("resolve", () => {
  describe("primitive interpolations", () => {
    it("resolves strings", () => {
      const result = resolve(tsa(["color: ", ";"]), ["red"], {})
      expect(result).toBe("color: red;")
    })

    it("resolves numbers", () => {
      const result = resolve(tsa(["flex: ", ";"]), [1], {})
      expect(result).toBe("flex: 1;")
    })

    it("resolves null as empty string", () => {
      const result = resolve(tsa(["a", "b"]), [null], {})
      expect(result).toBe("ab")
    })

    it("resolves undefined as empty string", () => {
      const result = resolve(tsa(["a", "b"]), [undefined], {})
      expect(result).toBe("ab")
    })

    it("resolves false as empty string", () => {
      const result = resolve(tsa(["a", "b"]), [false], {})
      expect(result).toBe("ab")
    })

    it("resolves true as empty string", () => {
      const result = resolve(tsa(["a", "b"]), [true], {})
      expect(result).toBe("ab")
    })
  })

  describe("function interpolations", () => {
    it("calls functions with props and uses return value", () => {
      const fn = (props: Record<string, unknown>) => props.color as string
      const result = resolve(tsa(["color: ", ";"]), [fn], { color: "blue" })
      expect(result).toBe("color: blue;")
    })

    it("resolves nested function results recursively", () => {
      const fn = () => () => "red"
      const result = resolve(tsa(["color: ", ";"]), [fn], {})
      expect(result).toBe("color: red;")
    })

    it("handles functions returning null", () => {
      const fn = () => null
      const result = resolve(tsa(["a", "b"]), [fn], {})
      expect(result).toBe("ab")
    })

    it("handles functions returning false (conditional)", () => {
      const fn = (props: Record<string, unknown>) => (props.active ? "color: red;" : false)
      const result = resolve(tsa(["", ""]), [fn], { active: false })
      expect(result).toBe("")
    })

    it("uses empty object when no props provided", () => {
      const fn = (props: Record<string, unknown>) =>
        Object.keys(props).length === 0 ? "empty" : "has-props"
      const result = resolve(tsa(["", ""]), [fn], {})
      expect(result).toBe("empty")
    })
  })

  describe("CSSResult interpolations", () => {
    it("resolves nested CSSResult", () => {
      const inner = css`color: red;`
      const result = resolveValue(inner, {})
      expect(result).toBe("color: red;")
    })

    it("resolves deeply nested CSSResults", () => {
      const inner1 = css`color: red;`
      const inner2 = css`${inner1} display: flex;`
      const result = resolveValue(inner2, {})
      expect(result).toBe("color: red; display: flex;")
    })

    it("resolves CSSResult with function interpolations", () => {
      const inner = css`color: ${((p: Record<string, unknown>) => p.color) as any};`
      const result = resolveValue(inner, { color: "green" })
      expect(result).toBe("color: green;")
    })
  })

  describe("array interpolations", () => {
    it("resolves arrays of values", () => {
      const result = resolve(tsa(["", ""]), [["a", "b", "c"]], {})
      expect(result).toBe("abc")
    })

    it("resolves arrays with CSSResults", () => {
      const inner = css`color: red;`
      const result = resolveValue([inner, " display: flex;"], {})
      expect(result).toBe("color: red; display: flex;")
    })
  })

  describe("combined patterns", () => {
    it("handles multiple interpolation types", () => {
      const result = resolve(
        tsa(["display: ", "; color: ", "; flex: ", ";"]),
        ["flex", "red", 1],
        {},
      )
      expect(result).toBe("display: flex; color: red; flex: 1;")
    })

    it("handles conditional CSS with logical AND (truthy)", () => {
      const condition = true
      const conditionalCss = condition && css`color: red;`
      const result = resolveValue(conditionalCss, {})
      expect(result).toBe("color: red;")
    })

    it("handles conditional CSS with logical AND (falsy)", () => {
      const condition = false
      const conditionalCss = condition && css`color: red;`
      const result = resolveValue(conditionalCss, {})
      expect(result).toBe("")
    })
  })
})

describe("CSSResult", () => {
  it("stores strings and values as readonly properties", () => {
    const strings = ["color: ", ";"] as unknown as TemplateStringsArray
    const values = ["red"]
    const result = new CSSResult(strings, values)
    expect(result.strings).toBe(strings)
    expect(result.values).toBe(values)
  })

  it("toString resolves with empty props", () => {
    const result = css`color: red;`
    expect(result.toString()).toBe("color: red;")
  })
})

describe("normalizeCSS", () => {
  describe("comment stripping", () => {
    it("strips CSS block comments", () => {
      expect(normalizeCSS("/* comment */ color: red;")).toBe("color: red;")
    })

    it("strips multiple block comments", () => {
      expect(normalizeCSS("/* BASE */ color: red; /* HOVER */ font-size: 1rem;")).toBe(
        "color: red; font-size: 1rem;",
      )
    })

    it("strips multiline block comments", () => {
      expect(normalizeCSS("/* --------\n   BASE STATE\n   -------- */\nheight: 3rem;")).toBe(
        "height: 3rem;",
      )
    })

    it("strips JS-style line comments", () => {
      expect(normalizeCSS("// this is not valid CSS\ncolor: red;")).toBe("color: red;")
    })

    it("preserves :// in URLs", () => {
      expect(normalizeCSS("background: url(https://example.com/img.png);")).toContain(
        "https://example.com/img.png",
      )
    })

    it("strips line comments but preserves URL protocols", () => {
      const result = normalizeCSS("// comment\nbackground: url(https://example.com/img.png);")
      expect(result).toContain("https://example.com/img.png")
      expect(result).not.toContain("// comment")
    })

    it("handles unterminated block comment", () => {
      expect(normalizeCSS("color: red; /* never closed")).toBe("color: red;")
    })

    it("handles unterminated line comment", () => {
      expect(normalizeCSS("color: red;\n// trailing comment")).toBe("color: red;")
    })
  })

  describe("whitespace handling", () => {
    it("collapses whitespace", () => {
      expect(normalizeCSS("  color:  red;   font-size:  1rem;  ")).toBe(
        "color: red; font-size: 1rem;",
      )
    })

    it("converts tabs and newlines to spaces", () => {
      expect(normalizeCSS("color:\tred;\nfont-size:\t1rem;")).toBe("color: red; font-size: 1rem;")
    })

    it("collapses multiple spaces", () => {
      expect(normalizeCSS("color:    red;")).toBe("color: red;")
    })

    it("trims leading and trailing whitespace", () => {
      expect(normalizeCSS("   color: red;   ")).toBe("color: red;")
    })

    it("handles carriage returns", () => {
      expect(normalizeCSS("color: red;\r\nfont-size: 1rem;")).toBe("color: red; font-size: 1rem;")
    })
  })

  describe("semicolon handling", () => {
    it("removes redundant semicolons after {", () => {
      expect(normalizeCSS(".foo {; color: red; }")).toBe(".foo { color: red; }")
    })

    it("removes redundant semicolons after }", () => {
      expect(normalizeCSS(".foo { color: red; }; .bar { }")).toBe(".foo { color: red; } .bar { }")
    })
  })

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(normalizeCSS("")).toBe("")
    })

    it("returns empty string for whitespace-only input", () => {
      expect(normalizeCSS("   \n\t  ")).toBe("")
    })

    it("handles CSS with braces", () => {
      expect(normalizeCSS(".foo { color: red; }")).toBe(".foo { color: red; }")
    })

    it("handles @media rules", () => {
      const result = normalizeCSS("@media (min-width: 48em) { color: blue; }")
      expect(result).toContain("@media")
      expect(result).toContain("color: blue;")
    })
  })
})
