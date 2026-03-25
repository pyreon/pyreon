import { describe, expect, it } from "vitest"
import processDescriptor from "../styles/styles/processDescriptor"
import type { PropertyDescriptor } from "../styles/styles/propertyMap"
import type { InnerTheme } from "../styles/styles/types"

// Minimal helpers matching the signature expected by processDescriptor
const mockCss = (strings: TemplateStringsArray, ...vals: any[]) => {
  let result = ""
  for (let i = 0; i < strings.length; i++) {
    result += strings[i]
    if (i < vals.length) result += String(vals[i] ?? "")
  }
  return result
}

const mockCalc = (...params: any[]) => {
  const val = params.find((p) => p != null)
  if (val == null) return null
  if (typeof val === "string") return val
  return `${val / 16}rem`
}

const mockEdge = (_property: string, _values: any) => null
const mockBorderRadius = (_props: any) => null

const t = (overrides: Partial<InnerTheme> = {}): InnerTheme => overrides as InnerTheme

describe("processDescriptor", () => {
  describe("simple kind", () => {
    const d: PropertyDescriptor = { kind: "simple", css: "display", key: "display" }

    it("returns CSS declaration when key has a value", () => {
      const result = processDescriptor(
        d,
        t({ display: "flex" }),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("display: flex;")
    })

    it("returns empty string when key is null", () => {
      const result = processDescriptor(
        d,
        t({ display: null as any }),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("")
    })

    it("returns empty string when key is undefined", () => {
      const result = processDescriptor(
        d,
        t({}),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("")
    })
  })

  describe("convert kind", () => {
    const d: PropertyDescriptor = { kind: "convert", css: "width", key: "width" }

    it("returns converted value through calc function", () => {
      const result = processDescriptor(
        d,
        t({ width: 32 } as any),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("width: 2rem;")
    })

    it("passes through string values", () => {
      const result = processDescriptor(
        d,
        t({ width: "50%" } as any),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("width: 50%;")
    })
  })

  describe("convert_fallback kind", () => {
    const d: PropertyDescriptor = {
      kind: "convert_fallback",
      css: "width",
      keys: ["width", "size"] as (keyof InnerTheme)[],
    }

    it("uses first defined key value", () => {
      const result = processDescriptor(
        d,
        t({ width: 16 } as any),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("width: 1rem;")
    })
  })

  describe("special kind", () => {
    it("returns fullScreen CSS when fullScreen is truthy", () => {
      const d: PropertyDescriptor = { kind: "special", id: "fullScreen" }
      const result = processDescriptor(
        d,
        t({ fullScreen: true } as any),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toContain("position: fixed")
      expect(result).toContain("top: 0")
    })

    it("returns empty string when fullScreen is falsy", () => {
      const d: PropertyDescriptor = { kind: "special", id: "fullScreen" }
      const result = processDescriptor(
        d,
        t({}),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("")
    })

    it("returns backgroundImage CSS when set", () => {
      const d: PropertyDescriptor = { kind: "special", id: "backgroundImage" }
      const result = processDescriptor(
        d,
        t({ backgroundImage: "url.png" } as any),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("background-image: url(url.png);")
    })

    it("returns animation CSS when keyframe is set", () => {
      const d: PropertyDescriptor = { kind: "special", id: "animation" }
      const result = processDescriptor(
        d,
        t({ keyframe: "fadeIn", animation: "0.3s ease" } as any),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("animation: fadeIn 0.3s ease;")
    })

    it("returns hideEmpty pseudo-selector when hideEmpty is true", () => {
      const d: PropertyDescriptor = { kind: "special", id: "hideEmpty" }
      const result = processDescriptor(
        d,
        t({ hideEmpty: true } as any),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toContain("&:empty")
      expect(result).toContain("display: none")
    })

    it("returns clearFix pseudo-element when clearFix is true", () => {
      const d: PropertyDescriptor = { kind: "special", id: "clearFix" }
      const result = processDescriptor(
        d,
        t({ clearFix: true } as any),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toContain("&::after")
      expect(result).toContain("clear: both")
    })

    it("returns empty string for unknown special id", () => {
      const d: PropertyDescriptor = { kind: "special", id: "unknown" }
      const result = processDescriptor(
        d,
        t({}),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("")
    })
  })

  describe("edge kind", () => {
    it("delegates to shorthand function", () => {
      const d: PropertyDescriptor = {
        kind: "edge",
        property: "margin",
        keys: {
          full: "margin" as keyof InnerTheme,
          x: "marginX" as keyof InnerTheme,
          y: "marginY" as keyof InnerTheme,
          top: "marginTop" as keyof InnerTheme,
          left: "marginLeft" as keyof InnerTheme,
          bottom: "marginBottom" as keyof InnerTheme,
          right: "marginRight" as keyof InnerTheme,
        },
      }
      const customEdge = () => "margin: 1rem;"
      const result = processDescriptor(
        d,
        t({ margin: 16 } as any),
        mockCss,
        mockCalc,
        customEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("margin: 1rem;")
    })

    it("returns empty string when shorthand returns null", () => {
      const d: PropertyDescriptor = {
        kind: "edge",
        property: "padding",
        keys: {
          full: "padding" as keyof InnerTheme,
          x: "paddingX" as keyof InnerTheme,
          y: "paddingY" as keyof InnerTheme,
          top: "paddingTop" as keyof InnerTheme,
          left: "paddingLeft" as keyof InnerTheme,
          bottom: "paddingBottom" as keyof InnerTheme,
          right: "paddingRight" as keyof InnerTheme,
        },
      }
      const result = processDescriptor(
        d,
        t({}),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("")
    })
  })

  describe("border_radius kind", () => {
    it("delegates to borderRadius function", () => {
      const d: PropertyDescriptor = {
        kind: "border_radius",
        keys: {
          full: "borderRadius" as keyof InnerTheme,
          top: "borderRadiusTop" as keyof InnerTheme,
          bottom: "borderRadiusBottom" as keyof InnerTheme,
          left: "borderRadiusLeft" as keyof InnerTheme,
          right: "borderRadiusRight" as keyof InnerTheme,
          topLeft: "borderRadiusTopLeft" as keyof InnerTheme,
          topRight: "borderRadiusTopRight" as keyof InnerTheme,
          bottomLeft: "borderRadiusBottomLeft" as keyof InnerTheme,
          bottomRight: "borderRadiusBottomRight" as keyof InnerTheme,
        },
      }
      const customBR = () => "border-radius: 4px;"
      const result = processDescriptor(
        d,
        t({ borderRadius: 4 } as any),
        mockCss,
        mockCalc,
        mockEdge as any,
        customBR as any,
      )
      expect(result).toBe("border-radius: 4px;")
    })

    it("returns empty string when borderRadius returns null", () => {
      const d: PropertyDescriptor = {
        kind: "border_radius",
        keys: {
          full: "borderRadius" as keyof InnerTheme,
          top: "borderRadiusTop" as keyof InnerTheme,
          bottom: "borderRadiusBottom" as keyof InnerTheme,
          left: "borderRadiusLeft" as keyof InnerTheme,
          right: "borderRadiusRight" as keyof InnerTheme,
          topLeft: "borderRadiusTopLeft" as keyof InnerTheme,
          topRight: "borderRadiusTopRight" as keyof InnerTheme,
          bottomLeft: "borderRadiusBottomLeft" as keyof InnerTheme,
          bottomRight: "borderRadiusBottomRight" as keyof InnerTheme,
        },
      }
      const result = processDescriptor(
        d,
        t({}),
        mockCss,
        mockCalc,
        mockEdge as any,
        mockBorderRadius as any,
      )
      expect(result).toBe("")
    })
  })
})
