import {
  parseBoxModel,
  parseCssDimension,
  parseFontWeight,
  parseLineHeight,
} from './cssValueParser'
import type { ResolvedStyles } from './types'

const TEXT_ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify'])
const FONT_STYLE_VALUES = new Set(['normal', 'italic'])
const TEXT_DECORATION_VALUES = new Set(['none', 'underline', 'line-through'])
const BORDER_STYLE_VALUES = new Set(['solid', 'dashed', 'dotted'])

/**
 * A value resolver — maps a style value to a render-target-evaluable one.
 * Under the CSS-variables theming mode, `$rocketstyle` values can be
 * `var(--…)` reference strings PDF/DOCX/email can't evaluate; supply a
 * resolver (compose `resolveModeVar` from `@pyreon/rocketstyle` with
 * `resolveCssVarReferences` from `@pyreon/unistyle`) to inline them to raw
 * values at extraction time. Non-strings / non-var values pass through
 * unchanged.
 */
export type VarResolver = (value: unknown) => unknown

/** Shallow copy with every own STRING value mapped through `resolveVar`. */
function remapStringValues(
  source: Record<string, unknown>,
  resolveVar: VarResolver,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key in source) {
    const v = source[key]
    out[key] = typeof v === 'string' ? resolveVar(v) : v
  }
  return out
}

/**
 * Convert a rocketstyle `$rocketstyle` theme object into a `ResolvedStyles`
 * object compatible with `@pyreon/document`.
 *
 * Only extracts properties that `ResolvedStyles` supports — everything else
 * (transitions, cursor, display, etc.) is silently ignored.
 *
 * `resolveVar` (optional): when the app runs under `init({ cssVariables: true })`,
 * `$rocketstyle` values may be `var(--…)` strings; the resolver inlines them
 * to raw values up front (PDF/DOCX can't evaluate custom properties). Omit it
 * for the classic path — values are already raw.
 */
export function resolveStyles(
  source: Record<string, unknown>,
  rootSize = 16,
  resolveVar?: VarResolver,
): ResolvedStyles {
  const styles: ResolvedStyles = {}

  // Inline any var() references ONCE up front so every downstream read sees a
  // raw value. Shallow copy — only own string values are remapped.
  const rocketstyle: Record<string, unknown> = resolveVar
    ? remapStringValues(source, resolveVar)
    : source

  // Typography
  const fontSize = parseCssDimension(rocketstyle.fontSize as string | number, rootSize)
  if (fontSize != null) styles.fontSize = fontSize

  if (typeof rocketstyle.fontFamily === 'string') styles.fontFamily = rocketstyle.fontFamily

  const fontWeight = parseFontWeight(rocketstyle.fontWeight as string | number | undefined)
  if (fontWeight != null) styles.fontWeight = fontWeight

  if (typeof rocketstyle.fontStyle === 'string' && FONT_STYLE_VALUES.has(rocketstyle.fontStyle))
    styles.fontStyle = rocketstyle.fontStyle as 'normal' | 'italic'

  if (
    typeof rocketstyle.textDecoration === 'string' &&
    TEXT_DECORATION_VALUES.has(rocketstyle.textDecoration)
  )
    styles.textDecoration = rocketstyle.textDecoration as 'none' | 'underline' | 'line-through'

  if (typeof rocketstyle.color === 'string') styles.color = rocketstyle.color

  if (typeof rocketstyle.backgroundColor === 'string')
    styles.backgroundColor = rocketstyle.backgroundColor

  if (typeof rocketstyle.textAlign === 'string' && TEXT_ALIGN_VALUES.has(rocketstyle.textAlign))
    styles.textAlign = rocketstyle.textAlign as 'left' | 'center' | 'right' | 'justify'

  const lineHeight = parseLineHeight(
    rocketstyle.lineHeight as string | number | undefined,
    rootSize,
  )
  if (lineHeight != null) styles.lineHeight = lineHeight

  const letterSpacing = parseCssDimension(rocketstyle.letterSpacing as string | number, rootSize)
  if (letterSpacing != null) styles.letterSpacing = letterSpacing

  // Box model
  const padding = parseBoxModel(rocketstyle.padding as string | number | undefined, rootSize)
  if (padding != null) styles.padding = padding

  const margin = parseBoxModel(rocketstyle.margin as string | number | undefined, rootSize)
  if (margin != null) styles.margin = margin

  // Border
  const borderRadius = parseCssDimension(rocketstyle.borderRadius as string | number, rootSize)
  if (borderRadius != null) styles.borderRadius = borderRadius

  const borderWidth = parseCssDimension(rocketstyle.borderWidth as string | number, rootSize)
  if (borderWidth != null) styles.borderWidth = borderWidth

  if (typeof rocketstyle.borderColor === 'string') styles.borderColor = rocketstyle.borderColor

  if (
    typeof rocketstyle.borderStyle === 'string' &&
    BORDER_STYLE_VALUES.has(rocketstyle.borderStyle)
  )
    styles.borderStyle = rocketstyle.borderStyle as 'solid' | 'dashed' | 'dotted'

  // Sizing
  if (rocketstyle.width != null) {
    const w = parseCssDimension(rocketstyle.width as string | number, rootSize)
    styles.width = w ?? (rocketstyle.width as string)
  }

  if (rocketstyle.height != null) {
    const h = parseCssDimension(rocketstyle.height as string | number, rootSize)
    styles.height = h ?? (rocketstyle.height as string)
  }

  if (rocketstyle.maxWidth != null) {
    const mw = parseCssDimension(rocketstyle.maxWidth as string | number, rootSize)
    styles.maxWidth = mw ?? (rocketstyle.maxWidth as string)
  }

  // Opacity
  if (typeof rocketstyle.opacity === 'number') styles.opacity = rocketstyle.opacity

  return styles
}
