// Shared style utilities used by both runtime-dom and runtime-server.

// CSS properties where numeric values are unitless (e.g. `opacity: 0.5`, `zIndex: 10`).
// All other numeric values get "px" appended automatically (e.g. `height: 100` → `"100px"`).
export const CSS_UNITLESS = new Set([
  "animationIterationCount",
  "aspectRatio",
  "borderImageOutset",
  "borderImageSlice",
  "borderImageWidth",
  "boxFlex",
  "boxFlexGroup",
  "boxOrdinalGroup",
  "columnCount",
  "columns",
  "flex",
  "flexGrow",
  "flexPositive",
  "flexShrink",
  "flexNegative",
  "flexOrder",
  "gridArea",
  "gridRow",
  "gridRowEnd",
  "gridRowSpan",
  "gridRowStart",
  "gridColumn",
  "gridColumnEnd",
  "gridColumnSpan",
  "gridColumnStart",
  "fontWeight",
  "lineClamp",
  "lineHeight",
  "opacity",
  "order",
  "orphans",
  "scale",
  "tabSize",
  "widows",
  "zIndex",
  "zoom",
  "fillOpacity",
  "floodOpacity",
  "stopOpacity",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeMiterlimit",
  "strokeOpacity",
  "strokeWidth",
])

/** Convert a camelCase CSS property name to kebab-case. */
export function toKebabCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/** Normalize a style value — appends "px" to numbers for non-unitless properties. */
export function normalizeStyleValue(key: string, value: unknown): string {
  return typeof value === "number" && !CSS_UNITLESS.has(key) ? `${value}px` : String(value)
}
