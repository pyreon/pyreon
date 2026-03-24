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

// ─── Class utilities ─────────────────────────────────────────────────────────

/** Value accepted by the `class` prop — string, array, object, or nested mix. */
export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ClassValue[]
  | Record<string, boolean | null | undefined | (() => boolean)>

function cxObject(obj: Record<string, boolean | null | undefined | (() => boolean)>): string {
  let result = ""
  for (const key in obj) {
    const v = obj[key]
    const truthy = typeof v === "function" ? v() : v
    if (truthy) result = result ? `${result} ${key}` : key
  }
  return result
}

function cxArray(arr: ClassValue[]): string {
  let result = ""
  for (const item of arr) {
    const resolved = cx(item)
    if (resolved) result = result ? `${result} ${resolved}` : resolved
  }
  return result
}

/** Resolve a ClassValue into a flat class string (like clsx/cx). */
export function cx(value: ClassValue): string {
  if (value == null || value === false || value === true) return ""
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) return cxArray(value)
  return cxObject(value)
}

// ─── Style utilities ─────────────────────────────────────────────────────────

/** Convert a camelCase CSS property name to kebab-case. */
export function toKebabCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/** Normalize a style value — appends "px" to numbers for non-unitless properties. */
export function normalizeStyleValue(key: string, value: unknown): string {
  return typeof value === "number" && !CSS_UNITLESS.has(key) ? `${value}px` : String(value)
}
