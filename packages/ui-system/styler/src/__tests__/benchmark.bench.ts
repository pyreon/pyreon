/**
 * Benchmark: @pyreon/styler CSS-in-JS operations
 *
 * Run: bun vitest bench
 *
 * Measures core CSS-in-JS operations:
 * 1. css() tagged template creation
 * 2. css() with interpolations
 * 3. Template resolution to CSS string
 * 4. Dynamic function interpolation
 * 5. Hash function throughput
 * 6. Nested css() composition
 * 7. styled() component factory
 * 8. normalizeCSS — Comment Stripping & Cleanup
 */
import { bench, describe } from "vitest"
import { css } from "../css"
import { hash } from "../hash"
import { normalizeCSS, resolve } from "../resolve"
import { styled } from "../styled"

// ============================================================================
// 1. CSS Tagged Template — Creation Speed
// ============================================================================
describe("css() tagged template creation", () => {
  bench("@pyreon/styler", () => {
    css`
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      margin: 8px;
      background-color: #f0f0f0;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `
  })
})

// ============================================================================
// 2. CSS Tagged Template with Interpolations
// ============================================================================
describe("css() with interpolations", () => {
  const color = "#ff0000"
  const size = "16px"

  bench("@pyreon/styler", () => {
    css`
      color: ${color};
      font-size: ${size};
      display: flex;
      padding: 8px;
    `
  })
})

// ============================================================================
// 3. Template Resolution (strings + values -> CSS string)
// ============================================================================
describe("template resolution to CSS string", () => {
  const strings = Object.assign(["display: flex; color: ", "; font-size: ", "; padding: 8px;"], {
    raw: ["display: flex; color: ", "; font-size: ", "; padding: 8px;"],
  }) as unknown as TemplateStringsArray

  const values = ["red", "16px"]
  const props = { theme: { primary: "blue" } }

  bench("@pyreon/styler resolve()", () => {
    resolve(strings, values, props)
  })
})

// ============================================================================
// 4. Dynamic Interpolation (function interpolations)
// ============================================================================
describe("dynamic function interpolation", () => {
  const props = { theme: { primary: "blue", size: "14px" }, active: true }

  const strings = Object.assign(["color: ", "; font-size: ", "; opacity: ", ";"], {
    raw: ["color: ", "; font-size: ", "; opacity: ", ";"],
  }) as unknown as TemplateStringsArray

  const stylerValues = [
    (p: any) => p.theme.primary,
    (p: any) => p.theme.size,
    (p: any) => (p.active ? "1" : "0.5"),
  ]

  bench("@pyreon/styler resolve()", () => {
    resolve(strings, stylerValues, props)
  })
})

// ============================================================================
// 5. Hash Function Throughput
// ============================================================================
describe("hash function throughput", () => {
  const shortCSS = "display: flex; color: red;"
  const mediumCSS =
    "display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; margin: 0 auto; max-width: 1200px; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.12);"
  const longCSS = mediumCSS.repeat(5)

  bench("@pyreon/styler FNV-1a (short)", () => {
    hash(shortCSS)
  })

  bench("@pyreon/styler FNV-1a (medium)", () => {
    hash(mediumCSS)
  })

  bench("@pyreon/styler FNV-1a (long)", () => {
    hash(longCSS)
  })
})

// ============================================================================
// 6. Nested css() Composition
// ============================================================================
describe("nested css() composition", () => {
  bench("@pyreon/styler", () => {
    const base = css`display: flex; padding: 8px;`
    const hover = css`background: #eee;`
    const result = css`
      ${base};
      &:hover { ${hover}; }
      color: red;
    `
    result.toString()
  })
})

// ============================================================================
// 7. Styled Component Creation (factory call)
// ============================================================================
describe("styled() component factory", () => {
  bench("@pyreon/styler", () => {
    styled("div")`display: flex; color: red; padding: 8px;`
  })
})

// ============================================================================
// 8. normalizeCSS — Comment Stripping & Cleanup
// ============================================================================
describe("normalizeCSS", () => {
  const plain =
    "  display: flex;  align-items: center;  justify-content: center;  padding: 16px;  margin: 8px;  background-color: #f0f0f0;  border-radius: 4px;  "

  const withBlockComments = `
    /* -------------------------------------------------------- */
    /* BASE STATE */
    /* -------------------------------------------------------- */
    display: flex; align-items: center; justify-content: center;
    padding: 16px; margin: 8px; background-color: #f0f0f0;
    /* -------------------------------------------------------- */
    /* HOVER STATE */
    /* -------------------------------------------------------- */
    &:hover { color: red; background: blue; }
    /* -------------------------------------------------------- */
    /* ACTIVE STATE */
    /* -------------------------------------------------------- */
    &:active { color: green; }
  `

  const withLineComments = `
    // base styles
    display: flex; align-items: center;
    // hover override
    &:hover { color: red; }
    background: url(https://example.com/img.png);
  `

  const withSemicolonJunk = "  ; display: flex;; ; color: red; ; font-size: 1rem;; ;  "

  bench("plain CSS (no comments)", () => {
    normalizeCSS(plain)
  })

  bench("CSS with /* */ block comments", () => {
    normalizeCSS(withBlockComments)
  })

  bench("CSS with // line comments", () => {
    normalizeCSS(withLineComments)
  })

  bench("CSS with semicolon junk", () => {
    normalizeCSS(withSemicolonJunk)
  })
})
