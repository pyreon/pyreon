// ============================================================================
// Inline `style={{ … }}` → native modifier lowering (the CSS-in-JS connector
// core).
//
// A canonical `@pyreon/primitives` element (`<Stack>`, `<Button>`, …) may carry
// an inline `style={{ padding: 16, backgroundColor: '#2563eb', borderRadius: 8 }}`.
// On the web the DOM renderer applies it verbatim; before this module the
// PMTC emit read NO `style` prop, so it was SILENTLY DROPPED on both native
// targets (no reader, no warning — the exact silent-drop class the a11y +
// data-testid lowerings closed for their props).
//
// This module is the shared lowering: a flat CSS-in-JS style object → a list
// of SwiftUI `.modifier()` / Jetpack-Compose `Modifier.x()` chain entries, so
// iOS + Android stay in lockstep from ONE source. It is called from the single
// cross-cutting modifier builder per target (`emitSwiftLayoutModifiers` /
// `emitKotlinLayoutModifier`), so it reaches all 15 primitives through one
// insertion point — mirroring how `AccessibilityProps` lowers.
//
// SCOPE (v1): STATIC object literals with LITERAL values only. This is the
// same "styling resolves at COMPILE time" contract the canonical styling props
// (`padding`/`background`/`radius`) already hold (`classifyDynamicStylingAttr`).
// A dynamic `style` value (`style={obj}`) or a dynamic FIELD value
// (`style={{ padding: n() }}`) is warned + dropped — the reactive-emit story is
// a tracked Phase-3 follow-up, not a silent gap.
//
// The property→modifier vocabulary is deliberately the intersection that lowers
// CLEANLY on both targets (padding box, background, border-radius, opacity,
// width, height) plus one Swift-only entry (`color` → `.foregroundColor`, which
// Compose expresses on the Text/LocalContentColor layer, not a Modifier). A
// web-only declaration set (cursor/user-select/transition/…) is stripped with
// no warning — it is a correct no-op on touch. Everything else is dropped with
// a single consolidated, NAMED warning so nothing vanishes silently.
// ============================================================================

import type { ExprIR } from './types'

type Target = 'swift' | 'kotlin'

export interface StyleLowerResult {
  /** Native modifier-chain entries, each beginning with `.` (Swift) or a
   *  Modifier extension call (Kotlin, WITHOUT the leading `Modifier`). Emitted
   *  in a per-target canonical order (see `ORDER`). */
  modifiers: string[]
  /** User-visible warnings for dropped / dynamic / unparseable declarations. */
  warnings: string[]
}

// Web-only declarations that are a correct NO-OP on a native touch target —
// stripped with no warning (they carry no visual information to lose).
const STRIP = new Set<string>([
  'cursor',
  'userSelect',
  'webkitUserSelect',
  'pointerEvents',
  'transition',
  'transitionProperty',
  'transitionDuration',
  'transitionTimingFunction',
  'transitionDelay',
  'outline',
  'outlineWidth',
  'outlineStyle',
  'outlineColor',
  'outlineOffset',
  'appearance',
  'webkitAppearance',
  'webkitFontSmoothing',
  'mozOsxFontSmoothing',
  'willChange',
  'touchAction',
  'userDrag',
  'webkitUserDrag',
  'scrollBehavior',
  'overscrollBehavior',
  'resize',
  'content',
  'boxSizing',
  'listStyle',
  'listStyleType',
])

// ── value parsers ───────────────────────────────────────────────────────────

/**
 * A CSS dimension → a unitless numeric value (interpreted as points/`dp`).
 * Accepts a JS number (unitless px, the idiomatic inline-style form) or a
 * `"16px"` / `"16"` string. Any other unit (`%`, `em`, `rem`, `vh`, …) has no
 * fixed native size and returns null (the caller drops + warns).
 */
export function parseDimension(v: string | number): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = v.trim()
  if (/^-?[\d.]+px$/.test(s)) return parseFloat(s)
  if (/^-?[\d.]+$/.test(s)) return parseFloat(s)
  return null
}

/**
 * A CSS color (`#rgb` / `#rrggbb` / `#rrggbbaa` / `rgb()` / `rgba()`) → a
 * per-target Color literal. Returns null for any other form (named colors,
 * `hsl()`, gradients, tokens) so the caller drops + warns rather than emitting
 * a wrong color. Named-color + theme-token support is a tracked follow-up.
 *
 * - Swift  → `Color(.sRGB, red: r, green: g, blue: b, opacity: a)` (0…1)
 * - Kotlin → `Color(0xAARRGGBB)` (alpha-aware; reuses the existing `Color(`
 *   import arm)
 */
export function parseCssColor(v: string, target: Target): string | null {
  const rgba = cssToRgba(v)
  if (rgba === null) return null
  const [r, g, b, a] = rgba
  if (target === 'swift') {
    const f = (n: number) => (n / 255).toFixed(3)
    return `Color(.sRGB, red: ${f(r)}, green: ${f(g)}, blue: ${f(b)}, opacity: ${a.toFixed(3)})`
  }
  const alpha = Math.round(a * 255)
  const hex = ((alpha << 24) | (r << 16) | (g << 8) | b) >>> 0
  return `Color(0x${hex.toString(16).padStart(8, '0').toUpperCase()})`
}

/** Parse a CSS color string to `[r, g, b, a]` (r/g/b 0…255, a 0…1) or null. */
function cssToRgba(css: string): [number, number, number, number] | null {
  const s = css.trim().toLowerCase()
  const fn = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  )
  if (fn) {
    const r = clampByte(+fn[1]!)
    const g = clampByte(+fn[2]!)
    const b = clampByte(+fn[3]!)
    const a = fn[4] !== undefined ? clamp01(+fn[4]) : 1
    return [r, g, b, a]
  }
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/)
  if (hex) {
    let h = hex[1]!
    if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return [r, g, b, a]
  }
  return null
}

const clampByte = (n: number): number => Math.max(0, Math.min(255, Math.round(n)))
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

/**
 * A `padding` / `margin`-style 1-to-4-value shorthand → resolved sides.
 * `16` → all 16; `"8px 16px"` → {t:8,b:8, l:16,r:16}; 3 → t / lr / b;
 * 4 → t r b l (CSS order). Returns null if any token fails to parse.
 */
function expandBoxShorthand(
  v: string | number,
): { top: number; right: number; bottom: number; left: number } | null {
  if (typeof v === 'number') {
    const n = parseDimension(v)
    return n === null ? null : { top: n, right: n, bottom: n, left: n }
  }
  const toks = v.trim().split(/\s+/)
  const nums = toks.map(parseDimension)
  if (nums.some((n) => n === null)) return null
  const [a, b, c, d] = nums as number[]
  switch (nums.length) {
    case 1:
      return { top: a!, right: a!, bottom: a!, left: a! }
    case 2:
      return { top: a!, right: b!, bottom: a!, left: b! }
    case 3:
      return { top: a!, right: b!, bottom: c!, left: b! }
    case 4:
      return { top: a!, right: b!, bottom: c!, left: d! }
    default:
      return null
  }
}

// ── the lowering ────────────────────────────────────────────────────────────

// Canonical modifier-chain order per target. SwiftUI wants
// `.padding().background().cornerRadius()` (background wraps the padded content,
// then rounds); Compose wants `.clip().background().padding()` (clip first so
// the fill is rounded, padding last so it insets content). Same filled-rounded
// visual, opposite chain order — encoded here so the emit is idiomatic for the
// inline-style-only case (where this segment IS the whole chain).
const ORDER: Record<Target, string[]> = {
  swift: ['padding', 'width', 'height', 'background', 'radius', 'opacity', 'color'],
  kotlin: ['width', 'height', 'radius', 'background', 'padding', 'opacity'],
}

/**
 * Lower a static inline-`style` object to native modifiers. `styleValue` is the
 * IR of the `style` attribute's value (`style={{ … }}` → an object literal).
 */
export function styleToNativeModifiers(
  styleValue: ExprIR,
  target: Target,
  tag: string,
): StyleLowerResult {
  const warnings: string[] = []
  if (styleValue.kind !== 'object') {
    return {
      modifiers: [],
      warnings: [
        `<${tag} style={…}>: only a static inline-style object literal is lowered to native — a dynamic style value has no native lowering yet and was dropped. Write the style as an object literal with literal values (reactive style is a tracked follow-up).`,
      ],
    }
  }
  if (styleValue.spreads !== undefined && styleValue.spreads.length > 0) {
    warnings.push(
      `<${tag} style={…}>: a {...spread} inside an inline style is not lowered to native (dropped); only its explicit literal properties are.`,
    )
  }

  // Per-slot native fragments, keyed so we can emit in canonical ORDER.
  const slots: Record<string, string> = {}
  const paddingBox: { top?: number; right?: number; bottom?: number; left?: number } = {}
  const dropped: string[] = []
  const dynamic: string[] = []
  const unparseable: string[] = []

  const readLiteral = (f: { name: string; value: ExprIR }): string | number | undefined => {
    if (f.value.kind !== 'literal') {
      dynamic.push(f.name)
      return undefined
    }
    const val = f.value.value
    return typeof val === 'string' || typeof val === 'number' ? val : undefined
  }

  for (const field of styleValue.fields) {
    const name = field.name
    if (STRIP.has(name)) continue

    switch (name) {
      case 'padding': {
        const raw = readLiteral(field)
        if (raw === undefined) break
        const box = expandBoxShorthand(raw)
        if (box === null) {
          unparseable.push(name)
          break
        }
        Object.assign(paddingBox, box)
        break
      }
      case 'paddingTop':
      case 'paddingRight':
      case 'paddingBottom':
      case 'paddingLeft': {
        const raw = readLiteral(field)
        if (raw === undefined) break
        const n = parseDimension(raw)
        if (n === null) {
          unparseable.push(name)
          break
        }
        const side = name.slice('padding'.length).toLowerCase() as
          | 'top'
          | 'right'
          | 'bottom'
          | 'left'
        paddingBox[side] = n
        break
      }
      case 'paddingX':
      case 'paddingHorizontal': {
        const raw = readLiteral(field)
        if (raw === undefined) break
        const n = parseDimension(raw)
        if (n === null) {
          unparseable.push(name)
          break
        }
        paddingBox.left = n
        paddingBox.right = n
        break
      }
      case 'paddingY':
      case 'paddingVertical': {
        const raw = readLiteral(field)
        if (raw === undefined) break
        const n = parseDimension(raw)
        if (n === null) {
          unparseable.push(name)
          break
        }
        paddingBox.top = n
        paddingBox.bottom = n
        break
      }
      case 'background':
      case 'backgroundColor': {
        const raw = readLiteral(field)
        if (raw === undefined) break
        const color = parseCssColor(String(raw), target)
        if (color === null) {
          unparseable.push(name)
          break
        }
        slots.background = target === 'swift' ? `.background(${color})` : `.background(${color})`
        break
      }
      case 'borderRadius': {
        const raw = readLiteral(field)
        if (raw === undefined) break
        const n = parseDimension(raw)
        if (n === null) {
          unparseable.push(name)
          break
        }
        slots.radius =
          target === 'swift' ? `.cornerRadius(${n})` : `.clip(RoundedCornerShape(${n}.dp))`
        break
      }
      case 'opacity': {
        const raw = readLiteral(field)
        if (raw === undefined) break
        const n = typeof raw === 'number' ? raw : parseFloat(raw)
        if (!Number.isFinite(n)) {
          unparseable.push(name)
          break
        }
        slots.opacity = target === 'swift' ? `.opacity(${n})` : `.alpha(${n}f)`
        break
      }
      case 'width': {
        const raw = readLiteral(field)
        if (raw === undefined) break
        const n = parseDimension(raw)
        if (n === null) {
          unparseable.push(name)
          break
        }
        slots.width = target === 'swift' ? `.frame(width: ${n})` : `.width(${n}.dp)`
        break
      }
      case 'height': {
        const raw = readLiteral(field)
        if (raw === undefined) break
        const n = parseDimension(raw)
        if (n === null) {
          unparseable.push(name)
          break
        }
        slots.height = target === 'swift' ? `.frame(height: ${n})` : `.height(${n}.dp)`
        break
      }
      case 'color': {
        // CSS `color` sets the foreground/text color of the subtree. SwiftUI
        // has a View-level `.foregroundColor`; Compose expresses text color on
        // the Text composable / LocalContentColor, not a Modifier — so it is a
        // Swift-only lowering here (Kotlin warns rather than emit a wrong or
        // structurally-dishonest modifier).
        const raw = readLiteral(field)
        if (raw === undefined) break
        if (target === 'kotlin') {
          warnings.push(
            `<${tag} style={{ color }}>: CSS \`color\` on a container has no Compose Modifier — set the color on the <Text> primitive (or via LocalContentColor) for Android. Lowered on iOS only.`,
          )
          break
        }
        const color = parseCssColor(String(raw), target)
        if (color === null) {
          unparseable.push(name)
          break
        }
        slots.color = `.foregroundColor(${color})`
        break
      }
      default:
        dropped.push(name)
    }
  }

  // Emit the resolved padding box in the minimal native form.
  const paddingMod = emitPadding(paddingBox, target)
  if (paddingMod !== undefined) slots.padding = paddingMod

  const modifiers = ORDER[target].map((slot) => slots[slot]).filter((m): m is string => !!m)

  if (dynamic.length > 0) {
    warnings.push(
      `<${tag} style={…}>: inline-style value(s) [${dynamic.join(', ')}] are not literal — a dynamic style value resolves at RUNTIME and has no compile-time native lowering (dropped). Use a literal, or a per-target adapter (Layer 4). Reactive style is a tracked follow-up.`,
    )
  }
  if (unparseable.length > 0) {
    warnings.push(
      `<${tag} style={…}>: inline-style value(s) [${unparseable.join(
        ', ',
      )}] could not be parsed to a native value (dropped) — colors must be #hex / rgb() / rgba(); dimensions must be a number or "Npx".`,
    )
  }
  if (dropped.length > 0) {
    warnings.push(
      `<${tag} style={…}>: CSS propert${dropped.length === 1 ? 'y' : 'ies'} [${dropped.join(
        ', ',
      )}] ha${dropped.length === 1 ? 's' : 've'} no native lowering yet and w${
        dropped.length === 1 ? 'as' : 'ere'
      } dropped. Use a canonical prop where one exists (padding/background/radius/gap/align), or a per-target adapter (Layer 4).`,
    )
  }

  return { modifiers, warnings }
}

/** Emit the resolved padding box in the minimal native form for the target. */
function emitPadding(
  box: { top?: number; right?: number; bottom?: number; left?: number },
  target: Target,
): string | undefined {
  const { top, right, bottom, left } = box
  if (top === undefined && right === undefined && bottom === undefined && left === undefined) {
    return undefined
  }
  // All four sides equal → the single-value form.
  if (top !== undefined && top === right && top === bottom && top === left) {
    return target === 'swift' ? `.padding(${top})` : `.padding(${top}.dp)`
  }
  const hOnly = left !== undefined && left === right && top === undefined && bottom === undefined
  const vOnly = top !== undefined && top === bottom && left === undefined && right === undefined
  // Horizontal-only / vertical-only → the axis form.
  if (hOnly && !vOnly) {
    return target === 'swift'
      ? `.padding(.horizontal, ${left})`
      : `.padding(horizontal = ${left}.dp)`
  }
  if (vOnly && !hOnly) {
    return target === 'swift' ? `.padding(.vertical, ${top})` : `.padding(vertical = ${top}.dp)`
  }
  // Symmetric H+V (all four set, top===bottom, left===right) → the two-axis form.
  if (top !== undefined && top === bottom && left !== undefined && left === right) {
    if (target === 'swift') {
      return `.padding(.vertical, ${top}).padding(.horizontal, ${left})`
    }
    return `.padding(horizontal = ${left}.dp, vertical = ${top}.dp)`
  }
  // Per-side — emit only the sides that were set.
  if (target === 'swift') {
    const parts: string[] = []
    if (top !== undefined) parts.push(`.padding(.top, ${top})`)
    if (left !== undefined) parts.push(`.padding(.leading, ${left})`)
    if (bottom !== undefined) parts.push(`.padding(.bottom, ${bottom})`)
    if (right !== undefined) parts.push(`.padding(.trailing, ${right})`)
    return parts.join('')
  }
  // Compose `Modifier.padding(start=, top=, end=, bottom=)` — omit unset sides
  // (they default to 0.dp, matching CSS's per-side default).
  const args: string[] = []
  if (left !== undefined) args.push(`start = ${left}.dp`)
  if (top !== undefined) args.push(`top = ${top}.dp`)
  if (right !== undefined) args.push(`end = ${right}.dp`)
  if (bottom !== undefined) args.push(`bottom = ${bottom}.dp`)
  return `.padding(${args.join(', ')})`
}
