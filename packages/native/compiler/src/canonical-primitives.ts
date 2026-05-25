// Canonical primitive emit table — shared by Swift + Kotlin emitters.
//
// `@pyreon/primitives` exports 16 semantic JSX primitives that are the
// cross-platform UI vocabulary (Phase A landed types + 6 web impls).
// Phase B (THIS) maps each primitive to its platform-native emit.
//
// ## What this file is
//
// - **Per-target tag name maps** — `<Stack>` → `VStack` on Swift / `Column` on Kotlin.
// - **Shared token-resolution helpers** — `padding={4}` → 16 (px/dp); `color="primary"`
//   → Swift `Color(...)` literal + Kotlin `Color(...)` literal. Single source
//   of truth so iOS + Android resolve the same canonical input to consistent
//   numeric/color values.
// - **`isCanonicalPrimitive` predicate** — the dispatchers in `emit-swift.ts` /
//   `emit-kotlin.ts` use this to decide whether to route through the canonical
//   emit functions before falling through to generic-tag emit.
//
// ## What this file is NOT
//
// - NOT per-target emit functions — those live in `emit-swift.ts` /
//   `emit-kotlin.ts` (one `emitSwiftStack` + one `emitKotlinStack`, etc.).
//   They consume the shared name maps + style helpers below.
// - NOT a JSX runtime — that's `@pyreon/primitives` (web side).
// - NOT a per-platform implementation — the iOS/Android emit GENERATES
//   the platform-native code; no runtime module is invoked.
//
// ## Scope (Phase B initial)
//
// 6 primitives wired end-to-end: Stack, Inline, Text, Button, Press, Field.
// The other 10 (Layer, Scroll, Spacer, Heading, Image, Icon, Link, Toggle,
// Modal) are listed in the name maps but DON'T have emit functions yet —
// the dispatcher falls through to generic-tag emit for them.
//
// Match the web-runtime scope shipped in #894.

// ============================================================================
// Canonical primitive name set
// ============================================================================

/**
 * All canonical primitive tag names. Single source of truth — the dispatchers
 * use `isCanonicalPrimitive` to decide whether to route through canonical
 * emit before falling through to generic emit.
 *
 * 16 primitives total (matches `@pyreon/primitives` exports). Per-target emit
 * functions only exist for the 6 Phase-A3-implemented primitives today; the
 * other 10 fall through to generic emit, which produces the LITERAL tag name
 * in the output — usable as a marker but not actually typecheck-clean on
 * either platform.
 */
export const CANONICAL_PRIMITIVES = new Set([
  // Layout (5)
  'Stack',
  'Inline',
  'Layer',
  'Scroll',
  'Spacer',
  // Content (4)
  'Text',
  'Heading',
  'Image',
  'Icon',
  // Interaction (3)
  'Button',
  'Press',
  'Link',
  // Input (3)
  'Field',
  'Toggle',
  'Modal',
])

export function isCanonicalPrimitive(tag: string): boolean {
  return CANONICAL_PRIMITIVES.has(tag)
}

// ============================================================================
// Per-target tag name maps
// ============================================================================

/**
 * Map canonical tag → Swift/SwiftUI View name. The Swift emit functions
 * (`emitSwiftStack`, `emitSwiftPress`, etc.) consult this table when
 * choosing the wrapper View. `<Stack direction="row">` switches at the
 * emit-function level to `HStack`.
 */
export const SWIFT_NAMES: Record<string, string> = {
  Stack: 'VStack', // direction="row" overrides to HStack at emit time
  Inline: 'HStack',
  Layer: 'ZStack',
  Scroll: 'ScrollView',
  Spacer: 'Spacer',
  Text: 'Text',
  Heading: 'Text', // .font(.largeTitle) at emit time
  Image: 'Image',
  Icon: 'Image', // systemName: from `name` prop
  Button: 'Button',
  Press: 'Button', // no chrome — emits the trailing-closure-only form
  Link: 'NavigationLink',
  Field: 'TextField', // SecureField when kind="password"
  Toggle: 'Toggle',
  Modal: 'Sheet', // .sheet(isPresented:) modifier-based
}

/**
 * Map canonical tag → Kotlin/Compose Composable name.
 */
export const KOTLIN_NAMES: Record<string, string> = {
  Stack: 'Column', // direction="row" overrides to Row at emit time
  Inline: 'Row',
  Layer: 'Box',
  Scroll: 'Column', // verticalScroll modifier
  Spacer: 'Spacer',
  Text: 'Text',
  Heading: 'Text', // style=MaterialTheme.typography... at emit time
  Image: 'AsyncImage',
  Icon: 'Icon',
  Button: 'Button',
  Press: 'Box', // Modifier.clickable
  Link: 'Box', // Modifier.clickable + nav controller
  Field: 'TextField',
  Toggle: 'Switch',
  Modal: 'Dialog',
}

// ============================================================================
// Token resolution — shared by Swift + Kotlin
// ============================================================================

/**
 * Resolve a canonical `padding` / `margin` / `gap` token to a pixel
 * (Swift CGFloat) / dp (Kotlin Dp) numeric value. The compiler emits
 * the integer; the platform converts to its native unit at runtime.
 *
 * - `0`-`9` → indexed 4px scale (0=0, 1=4, 2=8, ..., 9=48). Matches
 *   the web `@pyreon/primitives` token scale.
 * - `"xs"|"sm"|"md"|"lg"|"xl"` → semantic alias values (4/8/12/16/24).
 *
 * Unknown input returns 0 — defensive default; the canonical type-defs
 * constrain inputs to the allowed set so unknowns are catchable at the
 * TypeScript layer.
 */
export function resolveSpace(value: number | string): number {
  if (typeof value === 'number') {
    if (value >= 0 && value <= 9) return SPACE_BY_INDEX[value] ?? 0
    return 0
  }
  return SPACE_BY_NAME[value] ?? 0
}

const SPACE_BY_INDEX: Record<number, number> = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40, 9: 48,
}

const SPACE_BY_NAME: Record<string, number> = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24,
}

/**
 * Resolve a canonical color token to per-target color literal SOURCE
 * CODE. Returns the platform-native expression as a string ready to
 * splice into emit output.
 *
 * Web tokens are CSS hex strings (`#2563eb`). Native targets convert
 * to `Color(red:..., green:..., blue:...)` per-platform — same RGB,
 * just different syntax.
 *
 * Future arc: full theme integration — `Color.pyreonPrimary` extension
 * on Swift / `theme.colors.primary` on Compose. v1 keeps it inline +
 * literal so no runtime theme dependency.
 */
export function resolveColor(value: string, target: 'swift' | 'kotlin'): string {
  const rgb = COLOR_TOKENS_RGB[value]
  if (rgb === undefined) {
    // Unknown token — emit a neutral grey as a defensive fallback.
    return target === 'swift' ? 'Color.gray' : 'Color.Gray'
  }
  const [r, g, b] = rgb
  if (target === 'swift') {
    return `Color(red: ${r / 255}, green: ${g / 255}, blue: ${b / 255})`
  }
  // Kotlin / Compose Color hex: 0xFFRRGGBB. Emit bare `Color(...)`
  // matching the convention of @Serializable / Json / TextField / etc.
  // — consumer apps import from androidx.compose.ui.graphics.
  // Lets kotlin-stubs.ts ship the mock `Color` in the default package
  // without needing a multi-package stub file (Kotlin can't represent
  // that in one file).
  const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase()
  return `Color(0xFF${hex})`
}

/**
 * RGB values for the default color palette. Mirrors
 * `packages/core/primitives/src/web/tokens.ts:COLOR_TOKENS`. Apps
 * with a custom theme will replace this in a future-arc PR.
 */
const COLOR_TOKENS_RGB: Record<string, [number, number, number]> = {
  text: [0x11, 0x18, 0x27], // gray-900 #111827
  surface: [0xff, 0xff, 0xff], // white
  primary: [0x25, 0x63, 0xeb], // blue-600 #2563eb
  secondary: [0x6b, 0x72, 0x80], // gray-500 #6b7280
  success: [0x16, 0xa3, 0x4a], // green-600 #16a34a
  warning: [0xd9, 0x77, 0x06], // amber-600 #d97706
  danger: [0xdc, 0x26, 0x26], // red-600 #dc2626
  muted: [0x9c, 0xa3, 0xaf], // gray-400 #9ca3af
}

/**
 * Resolve a canonical `radius` token to a platform-native numeric value.
 * Same scale as web (`packages/core/primitives/src/web/tokens.ts`).
 *
 * - `none` → 0
 * - `sm` → 4
 * - `md` → 8
 * - `lg` → 16
 * - `full` → 9999 (max practical pill / circle radius)
 */
export function resolveRadius(value: string): number {
  const map: Record<string, number> = { none: 0, sm: 4, md: 8, lg: 16, full: 9999 }
  return map[value] ?? 0
}

/**
 * Map canonical `align` to per-target alignment expression.
 *
 * Swift: `HorizontalAlignment` enum (.leading/.center/.trailing) for
 * VStack; `VerticalAlignment` for HStack. Caller passes axis-aware via
 * the `flavor` arg — VStack callers want horizontal alignment of the
 * column's children.
 *
 * Kotlin: `Alignment.Start/CenterHorizontally/End` for Column;
 * `Alignment.Top/CenterVertically/Bottom` for Row.
 */
export function resolveAlign(
  value: string,
  target: 'swift' | 'kotlin',
  flavor: 'horizontal' | 'vertical',
): string {
  if (target === 'swift') {
    if (flavor === 'horizontal') {
      return ALIGN_SWIFT_H[value] ?? '.leading'
    }
    return ALIGN_SWIFT_V[value] ?? '.top'
  }
  if (flavor === 'horizontal') {
    return ALIGN_KOTLIN_H[value] ?? 'Alignment.Start'
  }
  return ALIGN_KOTLIN_V[value] ?? 'Alignment.Top'
}

const ALIGN_SWIFT_H: Record<string, string> = {
  start: '.leading', center: '.center', end: '.trailing', stretch: '.leading',
}
const ALIGN_SWIFT_V: Record<string, string> = {
  start: '.top', center: '.center', end: '.bottom', stretch: '.top',
}
const ALIGN_KOTLIN_H: Record<string, string> = {
  start: 'Alignment.Start',
  center: 'Alignment.CenterHorizontally',
  end: 'Alignment.End',
  stretch: 'Alignment.Start', // Compose has no direct "stretch" for column children
}
const ALIGN_KOTLIN_V: Record<string, string> = {
  start: 'Alignment.Top',
  center: 'Alignment.CenterVertically',
  end: 'Alignment.Bottom',
  stretch: 'Alignment.Top',
}
