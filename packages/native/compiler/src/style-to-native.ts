// ============================================================================
// Inline `style={{ … }}` → native modifier lowering (the CSS-in-JS connector
// core), STATIC and DYNAMIC.
//
// A canonical `@pyreon/primitives` element (`<Stack>`, `<Button>`, …) may carry
// an inline `style={{ padding: 16, backgroundColor: '#2563eb', borderRadius: 8 }}`.
// On the web the DOM renderer applies it verbatim; before this module the
// PMTC emit read NO `style` prop, so it was SILENTLY DROPPED on both native
// targets (the same silent-drop class the a11y + data-testid lowerings closed).
//
// This module is the shared lowering: a flat CSS-in-JS style object → a list
// of SwiftUI `.modifier()` / Jetpack-Compose `Modifier.x()` chain entries, so
// iOS + Android stay in lockstep from ONE source. It is called from the single
// cross-cutting modifier builder per target (`emitSwiftLayoutModifiers` /
// `emitKotlinLayoutModifier`), reaching all 15 primitives through one insertion
// point — mirroring how `AccessibilityProps` lowers.
//
// TWO shapes lower:
//   • STATIC — `style={{ … }}` (object literal, literal values). The same
//     "styling resolves at COMPILE time" contract the token props hold.
//   • DYNAMIC — `style={cond ? {A} : {B}}` (a ternary of two object literals).
//     Each shared property lowers to a REACTIVE conditional-value modifier
//     (`.background(active ? A : B)` / `.background(if (active) A else B)`).
//     `cond` reads a signal → SwiftUI `@State` / Compose `mutableStateOf`, so
//     the style flips on state change with NO extra machinery — the exact
//     reactive mechanism the canonical-prop ternary emit already ships. This is
//     the make-or-break "dynamic resolution → reactive emit" of the native-UI
//     plan, proven on the simplest case (a primitive's own inline style) before
//     it is layered onto rocketstyle's dimension props.
//
// Out of the DYNAMIC slice (v1, warned not dropped-silently): properties present
// in only ONE branch (asymmetric), and a padding box that is not a single
// all-sides value in both branches. Non-ternary dynamic (`style={obj}`,
// `cond && {A}`, nested ternary) warns + drops.
// ============================================================================

import type { ExprIR } from './types'

type Target = 'swift' | 'kotlin'

/** Emits a native boolean expression from a condition IR (target-specific;
 *  supplied by the caller, which owns the emit functions). */
export type CondEmitter = (cond: ExprIR) => string

export interface StyleLowerResult {
  /** Native modifier-chain entries, each beginning with `.` (Swift) or a
   *  Modifier extension call (Kotlin, WITHOUT the leading `Modifier`), emitted
   *  in a per-target canonical order. */
  modifiers: string[]
  /** User-visible warnings for dropped / dynamic / unparseable declarations. */
  warnings: string[]
}

// A simple (non-padding) slot's native form: `wrap(value)` is the full modifier;
// keeping value separate lets the DYNAMIC path combine two branches' values into
// one conditional expression through the SAME wrap.
interface SlotValue {
  wrap: (v: string) => string
  value: string
}

interface PadBox {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

/** A resolved border (uniform). `color`/`width` come from `borderWidth` +
 *  `borderColor` or the `border` shorthand; the shape's corner radius is the
 *  element's `borderRadius` (0 when absent). */
interface BorderSpec {
  width?: number
  /** native Color literal */
  color?: string
  /** a non-solid border-style was requested (approximated as solid + warned). */
  nonSolid?: boolean
}

/** min/max width/height → one combined frame (Swift) / widthIn+heightIn (Compose). */
interface FrameConstraints {
  minW?: number
  maxW?: number
  minH?: number
  maxH?: number
}

interface LoweredObject {
  slots: Record<string, SlotValue>
  box: PadBox
  border: BorderSpec
  frame: FrameConstraints
  /** the `borderRadius` value (for the border shape), 0 when absent. */
  radiusValue: number
  dropped: string[]
  dynamic: string[]
  unparseable: string[]
  /** kotlin-only: `color` present (no Compose Modifier — warned). */
  kotlinColor: boolean
  /** `margin*` present — no native equivalent, warned. */
  marginWarn: boolean
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

// Canonical modifier-chain order per target. SwiftUI wants
// `.padding().background().cornerRadius()` (background wraps the padded content,
// then rounds); Compose wants `.clip().background().padding()` (clip first so
// the fill is rounded, padding last so it insets content).
const ORDER: Record<Target, string[]> = {
  swift: [
    'padding', 'width', 'height', 'frameConstraints', 'aspectRatio',
    'background', 'radius', 'border', 'opacity', 'color',
  ],
  kotlin: [
    'width', 'height', 'frameConstraints', 'aspectRatio',
    'radius', 'background', 'border', 'padding', 'opacity',
  ],
}

// ── value parsers ───────────────────────────────────────────────────────────

/**
 * A CSS dimension → a unitless numeric value (interpreted as points/`dp`).
 * Accepts a JS number (unitless px) or a `"16px"` / `"16"` string. Any other
 * unit (`%`, `em`, `rem`, `vh`, …) has no fixed native size and returns null.
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
 * `hsl()`, gradients, tokens) so the caller drops + warns.
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

// ── Text typography ───────────────────────────────────────────────────────────
//
// Typography (`fontSize`/`fontWeight`/`color`/`textAlign`/`fontStyle`) on a Text
// can't flow through the layout-modifier connector uniformly: SwiftUI wants a
// `.font(.system(size:weight:))` MODIFIER, but Compose wants `fontSize`/
// `fontWeight`/… as `Text(...)` CONSTRUCTOR ARGS (there is no Compose text
// modifier). So the Text emit extracts typography from its style object, emits
// it per-target, and passes the REST to the connector (background/padding/border).

/** Typography leaves lifted out of a Text's style object (literal values only). */
export interface TextTypography {
  fontSize?: number
  fontWeight?: string | number
  color?: string
  textAlign?: string
  fontStyle?: string
}

const TYPOGRAPHY_KEYS = new Set(['fontSize', 'fontWeight', 'color', 'textAlign', 'fontStyle'])

/** Split a Text's style object into typography leaves + the remaining style
 *  (background/padding/border/etc.) the connector still lowers. Non-object /
 *  non-literal typography values are left in `rest` (unchanged connector path). */
export function extractTextTypography(styleValue: ExprIR): { typo: TextTypography; rest: ExprIR } {
  if (styleValue.kind !== 'object') return { typo: {}, rest: styleValue }
  const typo: TextTypography = {}
  const restFields: { name: string; value: ExprIR }[] = []
  for (const f of styleValue.fields) {
    const v = f.value.kind === 'literal' ? f.value.value : undefined
    if (TYPOGRAPHY_KEYS.has(f.name) && v !== undefined) {
      if (f.name === 'fontSize' && typeof v === 'number') typo.fontSize = v
      else if (f.name === 'fontWeight' && (typeof v === 'string' || typeof v === 'number')) typo.fontWeight = v
      else if (f.name === 'color' && typeof v === 'string') typo.color = v
      else if (f.name === 'textAlign' && typeof v === 'string') typo.textAlign = v
      else if (f.name === 'fontStyle' && typeof v === 'string') typo.fontStyle = v
      else restFields.push(f)
    } else {
      restFields.push(f)
    }
  }
  return { typo, rest: { kind: 'object', fields: restFields, spreads: styleValue.spreads ?? [] } }
}

const SWIFT_WEIGHT: Record<string, string> = {
  normal: '.regular', regular: '.regular', medium: '.medium', semibold: '.semibold',
  bold: '.bold', '400': '.regular', '500': '.medium', '600': '.semibold', '700': '.bold',
}
const SWIFT_ALIGN: Record<string, string> = {
  left: '.leading', start: '.leading', center: '.center', right: '.trailing', end: '.trailing',
}

/** SwiftUI typography → trailing `.font(.system(...)).foregroundColor(...)…` modifiers. */
export function swiftTextTypographyModifiers(typo: TextTypography): string {
  let out = ''
  if (typo.fontSize !== undefined || typo.fontWeight !== undefined) {
    const parts: string[] = []
    if (typo.fontSize !== undefined) parts.push(`size: ${typo.fontSize}`)
    const w = typo.fontWeight !== undefined ? SWIFT_WEIGHT[String(typo.fontWeight)] : undefined
    if (w) parts.push(`weight: ${w}`)
    if (parts.length > 0) out += `.font(.system(${parts.join(', ')}))`
  }
  if (typo.color !== undefined) {
    const c = parseCssColor(typo.color, 'swift')
    if (c) out += `.foregroundColor(${c})`
  }
  if (typo.textAlign !== undefined && SWIFT_ALIGN[typo.textAlign]) {
    out += `.multilineTextAlignment(${SWIFT_ALIGN[typo.textAlign]})`
  }
  if (typo.fontStyle === 'italic') out += '.italic()'
  return out
}

const KOTLIN_WEIGHT: Record<string, string> = {
  normal: 'FontWeight.Normal', regular: 'FontWeight.Normal', medium: 'FontWeight.Medium',
  semibold: 'FontWeight.SemiBold', bold: 'FontWeight.Bold', '400': 'FontWeight.Normal',
  '500': 'FontWeight.Medium', '600': 'FontWeight.SemiBold', '700': 'FontWeight.Bold',
}
const KOTLIN_ALIGN: Record<string, string> = {
  left: 'TextAlign.Start', start: 'TextAlign.Start', center: 'TextAlign.Center',
  right: 'TextAlign.End', end: 'TextAlign.End',
}

/** Compose typography → leading `, fontSize = …, fontWeight = …` Text() args. */
export function kotlinTextTypographyArgs(typo: TextTypography): string {
  const args: string[] = []
  if (typo.fontSize !== undefined) args.push(`fontSize = ${typo.fontSize}.sp`)
  if (typo.fontWeight !== undefined && KOTLIN_WEIGHT[String(typo.fontWeight)]) {
    args.push(`fontWeight = ${KOTLIN_WEIGHT[String(typo.fontWeight)]}`)
  }
  if (typo.color !== undefined) {
    const c = parseCssColor(typo.color, 'kotlin')
    if (c) args.push(`color = ${c}`)
  }
  if (typo.textAlign !== undefined && KOTLIN_ALIGN[typo.textAlign]) {
    args.push(`textAlign = ${KOTLIN_ALIGN[typo.textAlign]}`)
  }
  if (typo.fontStyle === 'italic') args.push('fontStyle = FontStyle.Italic')
  return args.length > 0 ? ', ' + args.join(', ') : ''
}

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

/** A 1-to-4-value box shorthand → resolved sides, or null if any token fails. */
function expandBoxShorthand(v: string | number): Required<PadBox> | null {
  if (typeof v === 'number') {
    const n = parseDimension(v)
    return n === null ? null : { top: n, right: n, bottom: n, left: n }
  }
  const nums = v.trim().split(/\s+/).map(parseDimension)
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

// ── lower one style object to per-slot values ───────────────────────────────

function lowerObject(fields: { name: string; value: ExprIR }[], target: Target): LoweredObject {
  const slots: Record<string, SlotValue> = {}
  const box: PadBox = {}
  const border: BorderSpec = {}
  const frame: FrameConstraints = {}
  let radiusValue = 0
  const dropped: string[] = []
  const dynamic: string[] = []
  const unparseable: string[] = []
  let kotlinColor = false
  let marginWarn = false

  const lit = (f: { name: string; value: ExprIR }): string | number | undefined => {
    if (f.value.kind !== 'literal') {
      dynamic.push(f.name)
      return undefined
    }
    const v = f.value.value
    return typeof v === 'string' || typeof v === 'number' ? v : undefined
  }
  const dim = (f: { name: string; value: ExprIR }): number | undefined => {
    const raw = lit(f)
    if (raw === undefined) return undefined
    const n = parseDimension(raw)
    if (n === null) {
      unparseable.push(f.name)
      return undefined
    }
    return n
  }

  for (const field of fields) {
    const name = field.name
    if (STRIP.has(name)) continue
    switch (name) {
      case 'padding': {
        const raw = lit(field)
        if (raw === undefined) break
        const b = expandBoxShorthand(raw)
        if (b === null) unparseable.push(name)
        else Object.assign(box, b)
        break
      }
      case 'paddingTop':
      case 'paddingRight':
      case 'paddingBottom':
      case 'paddingLeft': {
        const n = dim(field)
        if (n !== undefined) box[name.slice(7).toLowerCase() as keyof PadBox] = n
        break
      }
      case 'paddingX':
      case 'paddingHorizontal': {
        const n = dim(field)
        if (n !== undefined) {
          box.left = n
          box.right = n
        }
        break
      }
      case 'paddingY':
      case 'paddingVertical': {
        const n = dim(field)
        if (n !== undefined) {
          box.top = n
          box.bottom = n
        }
        break
      }
      case 'background':
      case 'backgroundColor': {
        const raw = lit(field)
        if (raw === undefined) break
        const c = parseCssColor(String(raw), target)
        if (c === null) unparseable.push(name)
        else slots.background = { wrap: (v) => `.background(${v})`, value: c }
        break
      }
      case 'borderRadius': {
        const n = dim(field)
        if (n !== undefined) {
          radiusValue = n
          slots.radius =
            target === 'swift'
              ? { wrap: (v) => `.cornerRadius(${v})`, value: String(n) }
              : { wrap: (v) => `.clip(RoundedCornerShape(${v}.dp))`, value: String(n) }
        }
        break
      }
      case 'borderWidth': {
        const n = dim(field)
        if (n !== undefined) border.width = n
        break
      }
      case 'borderColor': {
        const raw = lit(field)
        if (raw === undefined) break
        const c = parseCssColor(String(raw), target)
        if (c === null) unparseable.push(name)
        else border.color = c
        break
      }
      case 'borderStyle': {
        const raw = lit(field)
        if (raw !== undefined && raw !== 'solid' && raw !== 'none') border.nonSolid = true
        break
      }
      case 'border': {
        // `border: '1px solid #2563eb'` shorthand — width / style / color in any
        // order. A signal-valued shorthand is dynamic → warned by lit().
        const raw = lit(field)
        if (raw === undefined) break
        const parsed = parseBorderShorthand(String(raw), target)
        if (parsed === null) {
          unparseable.push(name)
          break
        }
        if (parsed.width !== undefined) border.width = parsed.width
        if (parsed.color !== undefined) border.color = parsed.color
        if (parsed.nonSolid) border.nonSolid = true
        break
      }
      case 'opacity': {
        const raw = lit(field)
        if (raw === undefined) break
        const n = typeof raw === 'number' ? raw : parseFloat(raw)
        if (!Number.isFinite(n)) unparseable.push(name)
        else
          slots.opacity =
            target === 'swift'
              ? { wrap: (v) => `.opacity(${v})`, value: String(n) }
              : // `f` is a Kotlin FLOAT-LITERAL suffix — it must sit on each
                // numeric value, NOT after the wrap: in the dynamic path the
                // value becomes `(if (c) 1 else 0.7)` and `(…)f` is a syntax
                // error (unlike `.dp`, an extension on the expression result).
                { wrap: (v) => `.alpha(${v})`, value: `${n}f` }
        break
      }
      case 'width': {
        const n = dim(field)
        if (n !== undefined)
          slots.width =
            target === 'swift'
              ? { wrap: (v) => `.frame(width: ${v})`, value: String(n) }
              : { wrap: (v) => `.width(${v}.dp)`, value: String(n) }
        break
      }
      case 'height': {
        const n = dim(field)
        if (n !== undefined)
          slots.height =
            target === 'swift'
              ? { wrap: (v) => `.frame(height: ${v})`, value: String(n) }
              : { wrap: (v) => `.height(${v}.dp)`, value: String(n) }
        break
      }
      case 'minWidth':
      case 'maxWidth':
      case 'minHeight':
      case 'maxHeight': {
        const n = dim(field)
        if (n !== undefined) {
          const key = { minWidth: 'minW', maxWidth: 'maxW', minHeight: 'minH', maxHeight: 'maxH' }[
            name
          ] as keyof FrameConstraints
          frame[key] = n
        }
        break
      }
      case 'aspectRatio': {
        const raw = lit(field)
        if (raw === undefined) break
        const r = parseAspectRatio(raw)
        if (r === null) {
          unparseable.push(name)
          break
        }
        slots.aspectRatio =
          target === 'swift'
            ? { wrap: (v) => `.aspectRatio(${v}, contentMode: .fit)`, value: r }
            : { wrap: (v) => `.aspectRatio(${v}f)`, value: r }
        break
      }
      case 'margin':
      case 'marginTop':
      case 'marginRight':
      case 'marginBottom':
      case 'marginLeft':
      case 'marginHorizontal':
      case 'marginVertical': {
        // Margin has no native equivalent — SwiftUI/Compose have no outer margin
        // box (spacing lives on the PARENT via padding / a Spacer). Warn, drop.
        marginWarn = true
        break
      }
      case 'color': {
        const raw = lit(field)
        if (raw === undefined) break
        if (target === 'kotlin') {
          kotlinColor = true
          break
        }
        const c = parseCssColor(String(raw), target)
        if (c === null) unparseable.push(name)
        else slots.color = { wrap: (v) => `.foregroundColor(${v})`, value: c }
        break
      }
      default:
        dropped.push(name)
    }
  }
  return {
    slots, box, border, frame, radiusValue, dropped, dynamic, unparseable, kotlinColor, marginWarn,
  }
}

/** A CSS `aspect-ratio` — a number (`1.5`) or a `"W / H"` ratio (`"16 / 9"`) → a
 *  Float-literal string, or null. */
function parseAspectRatio(v: string | number): string | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? String(v) : null
  const s = v.trim()
  const slash = s.match(/^([\d.]+)\s*\/\s*([\d.]+)$/)
  if (slash) {
    const w = parseFloat(slash[1]!)
    const h = parseFloat(slash[2]!)
    return h > 0 ? (w / h).toFixed(4).replace(/\.?0+$/, '') : null
  }
  const n = parseFloat(s)
  return Number.isFinite(n) && n > 0 ? String(n) : null
}

/** min/max width/height → one combined `.frame(…)` (Swift) / `.widthIn`+`.heightIn` (Compose). */
function emitFrameConstraints(f: FrameConstraints, target: Target): string | undefined {
  const { minW, maxW, minH, maxH } = f
  if (minW === undefined && maxW === undefined && minH === undefined && maxH === undefined) {
    return undefined
  }
  if (target === 'swift') {
    const args: string[] = []
    if (minW !== undefined) args.push(`minWidth: ${minW}`)
    if (maxW !== undefined) args.push(`maxWidth: ${maxW}`)
    if (minH !== undefined) args.push(`minHeight: ${minH}`)
    if (maxH !== undefined) args.push(`maxHeight: ${maxH}`)
    return `.frame(${args.join(', ')})`
  }
  const parts: string[] = []
  if (minW !== undefined || maxW !== undefined) {
    const a: string[] = []
    if (minW !== undefined) a.push(`min = ${minW}.dp`)
    if (maxW !== undefined) a.push(`max = ${maxW}.dp`)
    parts.push(`.widthIn(${a.join(', ')})`)
  }
  if (minH !== undefined || maxH !== undefined) {
    const a: string[] = []
    if (minH !== undefined) a.push(`min = ${minH}.dp`)
    if (maxH !== undefined) a.push(`max = ${maxH}.dp`)
    parts.push(`.heightIn(${a.join(', ')})`)
  }
  return parts.join('')
}

/** Parse a `border` shorthand (`"1px solid #2563eb"`, tokens in any order). */
function parseBorderShorthand(
  v: string,
  target: Target,
): { width?: number; color?: string; nonSolid?: boolean } | null {
  const tokens = v.trim().split(/\s+/)
  const out: { width?: number; color?: string; nonSolid?: boolean } = {}
  let matched = false
  for (const tok of tokens) {
    if (tok === 'solid' || tok === 'none') {
      matched = true
      continue
    }
    if (['dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'].includes(tok)) {
      out.nonSolid = true
      matched = true
      continue
    }
    const dim = parseDimension(tok)
    if (dim !== null) {
      out.width = dim
      matched = true
      continue
    }
    const color = parseCssColor(tok, target)
    if (color !== null) {
      out.color = color
      matched = true
    }
  }
  return matched ? out : null
}

/**
 * The border → one modifier, coordinated with the corner radius.
 * - Swift  → `.overlay(RoundedRectangle(cornerRadius: R).stroke(color, lineWidth: W))`
 * - Kotlin → `.border(BorderStroke(W.dp, color), RoundedCornerShape(R.dp))`
 * Returns undefined when width or color is missing (an incomplete border can't
 * render — the caller warns).
 */
function emitBorder(border: BorderSpec, radius: number, target: Target): string | undefined {
  if (border.width === undefined || border.color === undefined) return undefined
  const w = border.width
  const c = border.color
  if (target === 'swift') {
    return `.overlay(RoundedRectangle(cornerRadius: ${radius}).stroke(${c}, lineWidth: ${w}))`
  }
  return `.border(BorderStroke(${w}.dp, ${c}), RoundedCornerShape(${radius}.dp))`
}

// ── emit ────────────────────────────────────────────────────────────────────

/** The resolved padding box → the minimal native modifier form (static). */
function emitPadding(box: PadBox, target: Target): string | undefined {
  const { top, right, bottom, left } = box
  if (top === undefined && right === undefined && bottom === undefined && left === undefined) {
    return undefined
  }
  if (top !== undefined && top === right && top === bottom && top === left) {
    return target === 'swift' ? `.padding(${top})` : `.padding(${top}.dp)`
  }
  const hOnly = left !== undefined && left === right && top === undefined && bottom === undefined
  const vOnly = top !== undefined && top === bottom && left === undefined && right === undefined
  if (hOnly && !vOnly) {
    return target === 'swift'
      ? `.padding(.horizontal, ${left})`
      : `.padding(horizontal = ${left}.dp)`
  }
  if (vOnly && !hOnly) {
    return target === 'swift' ? `.padding(.vertical, ${top})` : `.padding(vertical = ${top}.dp)`
  }
  if (top !== undefined && top === bottom && left !== undefined && left === right) {
    return target === 'swift'
      ? `.padding(.vertical, ${top}).padding(.horizontal, ${left})`
      : `.padding(horizontal = ${left}.dp, vertical = ${top}.dp)`
  }
  if (target === 'swift') {
    const p: string[] = []
    if (top !== undefined) p.push(`.padding(.top, ${top})`)
    if (left !== undefined) p.push(`.padding(.leading, ${left})`)
    if (bottom !== undefined) p.push(`.padding(.bottom, ${bottom})`)
    if (right !== undefined) p.push(`.padding(.trailing, ${right})`)
    return p.join('')
  }
  const args: string[] = []
  if (left !== undefined) args.push(`start = ${left}.dp`)
  if (top !== undefined) args.push(`top = ${top}.dp`)
  if (right !== undefined) args.push(`end = ${right}.dp`)
  if (bottom !== undefined) args.push(`bottom = ${bottom}.dp`)
  return `.padding(${args.join(', ')})`
}

/** A box that is a single, all-four-sides-equal value → that value, else null. */
function boxAllSides(box: PadBox): number | null {
  const { top, right, bottom, left } = box
  return top !== undefined && top === right && top === bottom && top === left ? top : null
}

function condExpr(target: Target, cond: string, a: string, b: string): string {
  return target === 'swift' ? `((${cond}) ? ${a} : ${b})` : `(if (${cond}) ${a} else ${b})`
}

function collectWarnings(lo: LoweredObject, tag: string): string[] {
  const w: string[] = []
  const hasW = lo.border.width !== undefined
  const hasC = lo.border.color !== undefined
  if (hasW !== hasC) {
    w.push(
      `<${tag} style={…}>: a border needs BOTH borderWidth and borderColor (only ${
        hasW ? 'borderWidth' : 'borderColor'
      } was given) — no border was emitted.`,
    )
  }
  if (lo.border.nonSolid && hasW && hasC) {
    w.push(
      `<${tag} style={{ borderStyle }}>: only a solid border lowers to native — the non-solid style was approximated as solid.`,
    )
  }
  if (lo.marginWarn) {
    w.push(
      `<${tag} style={{ margin }}>: CSS \`margin\` has no native equivalent (SwiftUI/Compose have no outer-margin box) — it was dropped. Put spacing on the PARENT via its \`padding\`/\`gap\`, or add a <Spacer/>.`,
    )
  }
  if (lo.kotlinColor) {
    w.push(
      `<${tag} style={{ color }}>: CSS \`color\` on a container has no Compose Modifier — set the color on the <Text> primitive (or via LocalContentColor) for Android. Lowered on iOS only.`,
    )
  }
  if (lo.dynamic.length > 0) {
    w.push(
      `<${tag} style={…}>: inline-style value(s) [${lo.dynamic.join(', ')}] are not literal — a dynamic style value resolves at RUNTIME and has no compile-time native lowering (dropped). Use a literal, a two-literal ternary (style={cond ? {…} : {…}}), or a per-target adapter (Layer 4).`,
    )
  }
  if (lo.unparseable.length > 0) {
    w.push(
      `<${tag} style={…}>: inline-style value(s) [${lo.unparseable.join(
        ', ',
      )}] could not be parsed to a native value (dropped) — colors must be #hex / rgb() / rgba(); dimensions must be a number or "Npx".`,
    )
  }
  if (lo.dropped.length > 0) {
    const n = lo.dropped.length
    w.push(
      `<${tag} style={…}>: CSS propert${n === 1 ? 'y' : 'ies'} [${lo.dropped.join(', ')}] ha${
        n === 1 ? 's' : 've'
      } no native lowering yet and w${n === 1 ? 'as' : 'ere'} dropped. Use a canonical prop where one exists (padding/background/radius/gap/align), or a per-target adapter (Layer 4).`,
    )
  }
  return w
}

/**
 * Lower an inline `style` value to native modifiers. `styleValue` is the IR of
 * the `style` attribute's value: an object literal (STATIC) or a ternary of two
 * object literals (DYNAMIC — needs `emitCond`).
 */
export function styleToNativeModifiers(
  styleValue: ExprIR,
  target: Target,
  tag: string,
  emitCond?: CondEmitter,
): StyleLowerResult {
  // STATIC — `style={{ … }}`
  if (styleValue.kind === 'object') {
    const lo = lowerObject(styleValue.fields, target)
    const warnings = collectWarnings(lo, tag)
    if (styleValue.spreads !== undefined && styleValue.spreads.length > 0) {
      warnings.unshift(
        `<${tag} style={…}>: a {...spread} inside an inline style is not lowered to native (dropped); only its explicit literal properties are.`,
      )
    }
    return { modifiers: emitStatic(lo, target), warnings }
  }

  // DYNAMIC — `style={cond ? {A} : {B}}`
  if (
    styleValue.kind === 'ternary' &&
    styleValue.then.kind === 'object' &&
    styleValue.otherwise.kind === 'object'
  ) {
    if (emitCond === undefined) {
      return {
        modifiers: [],
        warnings: [
          `<${tag} style={cond ? … : …}>: dynamic inline style is not lowerable in this position (dropped).`,
        ],
      }
    }
    return emitDynamic(styleValue.then, styleValue.otherwise, styleValue.cond, target, tag, emitCond)
  }

  return {
    modifiers: [],
    warnings: [
      `<${tag} style={…}>: only a static inline-style object literal, or a two-branch ternary of object literals (style={cond ? {…} : {…}}), is lowered to native — this style value was dropped. Reactive style beyond a two-literal ternary is a tracked follow-up.`,
    ],
  }
}

function emitStatic(lo: LoweredObject, target: Target): string[] {
  const pad = emitPadding(lo.box, target)
  return ORDER[target]
    .map((slot) => {
      if (slot === 'padding') return pad
      if (slot === 'border') return emitBorder(lo.border, lo.radiusValue, target)
      if (slot === 'frameConstraints') return emitFrameConstraints(lo.frame, target)
      const s = lo.slots[slot]
      return s ? s.wrap(s.value) : undefined
    })
    .filter((m): m is string => m !== undefined)
}

function emitDynamic(
  thenObj: Extract<ExprIR, { kind: 'object' }>,
  elseObj: Extract<ExprIR, { kind: 'object' }>,
  cond: ExprIR,
  target: Target,
  tag: string,
  emitCond: CondEmitter,
): StyleLowerResult {
  const a = lowerObject(thenObj.fields, target)
  const b = lowerObject(elseObj.fields, target)
  const c = emitCond(cond)
  const warnings = [...collectWarnings(a, tag), ...collectWarnings(b, tag)]
  const asymmetric: string[] = []
  const modifiers: string[] = []

  for (const slot of ORDER[target]) {
    if (slot === 'border') {
      const aHas = a.border.width !== undefined && a.border.color !== undefined
      const bHas = b.border.width !== undefined && b.border.color !== undefined
      if (!aHas && !bHas) continue
      // A border is a COMPOSITE modifier (width+color+shape) — folding a
      // per-branch conditional into it is a v1 gap. Emit the `then` branch's
      // border statically + warn (mirrors asymmetric padding).
      const stat = emitBorder(a.border, a.radiusValue, target)
      if (stat !== undefined) modifiers.push(stat)
      asymmetric.push('border')
      continue
    }
    if (slot === 'frameConstraints') {
      const aHas = Object.keys(a.frame).length > 0
      const bHas = Object.keys(b.frame).length > 0
      if (!aHas && !bHas) continue
      // min/max constraints combine into one composite frame — a per-branch
      // conditional isn't foldable in v1. Emit the then-branch + warn.
      const stat = emitFrameConstraints(a.frame, target)
      if (stat !== undefined) modifiers.push(stat)
      asymmetric.push('minWidth/minHeight')
      continue
    }
    if (slot === 'padding') {
      const av = boxAllSides(a.box)
      const bv = boxAllSides(b.box)
      const aHas = Object.keys(a.box).length > 0
      const bHas = Object.keys(b.box).length > 0
      if (!aHas && !bHas) continue
      if (av !== null && bv !== null) {
        const v = condExpr(target, c, String(av), String(bv))
        modifiers.push(target === 'swift' ? `.padding(${v})` : `.padding(${v}.dp)`)
      } else {
        // A per-side/axis padding differing across branches can't fold into one
        // conditional value — emit the `then` branch statically and warn.
        const stat = emitPadding(a.box, target)
        if (stat !== undefined) modifiers.push(stat)
        asymmetric.push('padding')
      }
      continue
    }
    const sa = a.slots[slot]
    const sb = b.slots[slot]
    if (sa && sb) {
      modifiers.push(sa.wrap(condExpr(target, c, sa.value, sb.value)))
    } else if (sa || sb) {
      // Present in one branch only — emit it statically (from whichever branch
      // has it) and warn; a conditional "apply-or-not" modifier is a v1 gap.
      const only = (sa ?? sb)!
      modifiers.push(only.wrap(only.value))
      asymmetric.push(slot)
    }
  }

  if (asymmetric.length > 0) {
    warnings.push(
      `<${tag} style={cond ? … : …}>: propert${asymmetric.length === 1 ? 'y' : 'ies'} [${[
        ...new Set(asymmetric),
      ].join(
        ', ',
      )}] differ in shape or exist in only one branch — a per-branch conditional was not foldable, so the first branch's value was emitted statically. Give both branches the same property with two literal values for a reactive flip.`,
    )
  }
  return { modifiers, warnings }
}
