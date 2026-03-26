import { describe, expect, it } from "vitest"
import { fontVariables, googleFontsUrl, parseGoogleFamily, resolveGoogleFont } from "../font"

describe("parseGoogleFamily", () => {
  it("parses family with weights", () => {
    const result = parseGoogleFamily("Inter:wght@400;500;700")
    expect(result.family).toBe("Inter")
    expect(result.variable).toBe(false)
    expect(result.italic).toBe(false)
    if (!result.variable) {
      expect(result.weights).toEqual([400, 500, 700])
    }
  })

  it("parses family without weight spec", () => {
    const result = parseGoogleFamily("Roboto")
    expect(result.family).toBe("Roboto")
    expect(result.variable).toBe(false)
    if (!result.variable) {
      expect(result.weights).toEqual([400])
    }
  })

  it("parses family with italic", () => {
    const result = parseGoogleFamily("Lora:ital,wght@400;700")
    expect(result.family).toBe("Lora")
    expect(result.italic).toBe(true)
    expect(result.variable).toBe(false)
    if (!result.variable) {
      expect(result.weights).toEqual([400, 700])
    }
  })

  it("trims whitespace from family name", () => {
    const result = parseGoogleFamily("  Open Sans :wght@300")
    expect(result.family).toBe("Open Sans")
    if (!result.variable) {
      expect(result.weights).toEqual([300])
    }
  })

  it("parses variable font with weight range", () => {
    const result = parseGoogleFamily("Inter:wght@100..900")
    expect(result.family).toBe("Inter")
    expect(result.variable).toBe(true)
    if (result.variable) {
      expect(result.weightRange).toEqual([100, 900])
    }
  })

  it("parses variable font with italic", () => {
    const result = parseGoogleFamily("Inter:ital,wght@100..900")
    expect(result.family).toBe("Inter")
    expect(result.variable).toBe(true)
    expect(result.italic).toBe(true)
    if (result.variable) {
      expect(result.weightRange).toEqual([100, 900])
    }
  })

  it("parses variable font with partial range", () => {
    const result = parseGoogleFamily("Roboto Flex:wght@400..700")
    expect(result.family).toBe("Roboto Flex")
    expect(result.variable).toBe(true)
    if (result.variable) {
      expect(result.weightRange).toEqual([400, 700])
    }
  })
})

describe("resolveGoogleFont", () => {
  it("passes through string to parseGoogleFamily", () => {
    const result = resolveGoogleFont("Inter:wght@400;700")
    expect(result.family).toBe("Inter")
    expect(result.variable).toBe(false)
    if (!result.variable) {
      expect(result.weights).toEqual([400, 700])
    }
  })

  it("resolves static object config", () => {
    const result = resolveGoogleFont({
      family: "Inter",
      weights: [400, 500, 700],
    })
    expect(result.family).toBe("Inter")
    expect(result.variable).toBe(false)
    expect(result.italic).toBe(false)
    if (!result.variable) {
      expect(result.weights).toEqual([400, 500, 700])
    }
  })

  it("resolves variable object config", () => {
    const result = resolveGoogleFont({
      family: "Inter",
      variable: true,
      weightRange: [100, 900],
    })
    expect(result.family).toBe("Inter")
    expect(result.variable).toBe(true)
    if (result.variable) {
      expect(result.weightRange).toEqual([100, 900])
    }
  })

  it("resolves object config with italic", () => {
    const result = resolveGoogleFont({
      family: "Lora",
      weights: [400, 700],
      italic: true,
    })
    expect(result.italic).toBe(true)
  })

  it("defaults italic to false for objects", () => {
    const result = resolveGoogleFont({ family: "Inter", weights: [400] })
    expect(result.italic).toBe(false)
  })
})

describe("googleFontsUrl", () => {
  it("generates correct URL for single family", () => {
    const url = googleFontsUrl([
      {
        family: "Inter",
        weights: [400, 700],
        italic: false,
        variable: false as const,
      },
    ])
    expect(url).toContain("fonts.googleapis.com/css2")
    expect(url).toContain("family=Inter:wght@400;700")
    expect(url).toContain("display=swap")
  })

  it("generates correct URL for multiple families", () => {
    const url = googleFontsUrl([
      {
        family: "Inter",
        weights: [400],
        italic: false,
        variable: false as const,
      },
      {
        family: "JetBrains Mono",
        weights: [400],
        italic: false,
        variable: false as const,
      },
    ])
    expect(url).toContain("family=Inter:wght@400")
    expect(url).toContain("family=JetBrains+Mono:wght@400")
  })

  it("handles italic families", () => {
    const url = googleFontsUrl([
      {
        family: "Lora",
        weights: [400, 700],
        italic: true,
        variable: false as const,
      },
    ])
    expect(url).toContain("family=Lora:ital,wght@0,400;1,400;0,700;1,700")
  })

  it("uses custom display value", () => {
    const url = googleFontsUrl(
      [
        {
          family: "Inter",
          weights: [400],
          italic: false,
          variable: false as const,
        },
      ],
      "optional",
    )
    expect(url).toContain("display=optional")
  })

  it("generates variable font URL with weight range", () => {
    const url = googleFontsUrl([
      {
        family: "Inter",
        italic: false,
        variable: true as const,
        weightRange: [100, 900],
      },
    ])
    expect(url).toContain("family=Inter:wght@100..900")
  })

  it("generates variable font URL with italic and range", () => {
    const url = googleFontsUrl([
      {
        family: "Inter",
        italic: true,
        variable: true as const,
        weightRange: [100, 900],
      },
    ])
    expect(url).toContain("family=Inter:ital,wght@0,100..900;1,100..900")
  })

  it("mixes static and variable families", () => {
    const url = googleFontsUrl([
      {
        family: "Inter",
        italic: false,
        variable: true as const,
        weightRange: [100, 900],
      },
      {
        family: "JetBrains Mono",
        weights: [400, 700],
        italic: false,
        variable: false as const,
      },
    ])
    expect(url).toContain("family=Inter:wght@100..900")
    expect(url).toContain("family=JetBrains+Mono:wght@400;700")
  })
})

describe("fontVariables", () => {
  it("generates CSS variables", () => {
    const css = fontVariables({
      sans: '"Inter", system-ui, sans-serif',
      mono: '"JetBrains Mono", monospace',
    })
    expect(css).toContain(":root {")
    expect(css).toContain('--font-sans: "Inter", system-ui, sans-serif;')
    expect(css).toContain('--font-mono: "JetBrains Mono", monospace;')
    expect(css).toContain("}")
  })
})
