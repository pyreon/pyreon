import type { Values } from "../../units/values"
import type { BorderRadius } from "../shorthands/borderRadius"
import type { Edge } from "../shorthands/edge"
import type { PropertyDescriptor } from "./propertyMap"
import type { InnerTheme } from "./types"

type Css = (strings: TemplateStringsArray, ...values: any[]) => string
type Calc = (...params: any[]) => ReturnType<Values>

/** Mirrors the Value / PropertyValue types used by edge and borderRadius shorthands. */
type Value = string | number | null | undefined

const toCssDecl = (css: string, v: unknown) => (v == null ? "" : `${css}: ${v};`)

const processSpecial = (
  d: Extract<PropertyDescriptor, { kind: "special" }>,
  t: InnerTheme,
): string => {
  switch (d.id) {
    case "fullScreen":
      if (!t.fullScreen) return ""
      return "position: fixed; top: 0; left: 0; right: 0; bottom: 0;"

    case "backgroundImage":
      if (!t.backgroundImage) return ""
      return `background-image: url(${t.backgroundImage});`

    case "animation": {
      const parts = [t.keyframe, t.animation].filter(Boolean).join(" ")
      return parts ? `animation: ${parts};` : ""
    }

    case "hideEmpty":
      if (!t.hideEmpty) return ""
      return "&:empty { display: none; }"

    case "clearFix":
      if (!t.clearFix) return ""
      return '&::after { clear: both; content: ""; display: table; }'

    case "extendCss":
      return (t.extendCss as string) ?? ""

    default:
      return ""
  }
}

const processDescriptor = (
  d: PropertyDescriptor,
  t: InnerTheme,
  _css: Css,
  calc: Calc,
  shorthand: ReturnType<Edge>,
  borderRadiusFn: ReturnType<BorderRadius>,
): string => {
  switch (d.kind) {
    case "simple":
      return toCssDecl(d.css, t[d.key])

    case "convert":
      return toCssDecl(d.css, calc(t[d.key]))

    case "convert_fallback":
      return toCssDecl(d.css, calc(...d.keys.map((k) => t[k])))

    case "edge":
      return (
        shorthand(d.property, {
          full: t[d.keys.full] as Value,
          x: t[d.keys.x] as Value,
          y: t[d.keys.y] as Value,
          top: t[d.keys.top] as Value,
          left: t[d.keys.left] as Value,
          bottom: t[d.keys.bottom] as Value,
          right: t[d.keys.right] as Value,
        }) ?? ""
      )

    case "border_radius":
      return (
        borderRadiusFn({
          full: t[d.keys.full] as Value,
          top: t[d.keys.top] as Value,
          bottom: t[d.keys.bottom] as Value,
          left: t[d.keys.left] as Value,
          right: t[d.keys.right] as Value,
          topLeft: t[d.keys.topLeft] as Value,
          topRight: t[d.keys.topRight] as Value,
          bottomLeft: t[d.keys.bottomLeft] as Value,
          bottomRight: t[d.keys.bottomRight] as Value,
        }) ?? ""
      )

    case "special":
      return processSpecial(d, t)
  }
}

export default processDescriptor
