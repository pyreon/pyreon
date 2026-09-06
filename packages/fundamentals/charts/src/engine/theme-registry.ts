// Theme registry — ECharts-shaped named themes over the engine's ChartTheme.
//
// A module-level Map is the right home here: themes are static configuration
// registered at startup (never per render), bounded by the number of names an
// app registers, and looked up by name from the option facade.

import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import { chartThemes, resolveChartTheme } from './theme'
import type { OptionWarning } from './option'

/**
 * A named theme: any subset of the `ChartTheme` tokens, plus the ECharts-shaped
 * aliases (`color` / `backgroundColor` / `textStyle` / `axisLineColor` /
 * `splitLineColor`) so a theme copied from an ECharts project registers as-is.
 * An alias and its token both given: the token wins.
 */
export interface ThemeDefinition extends Partial<ChartTheme> {
  /** Alias of `palette`. */
  color?: string[] | undefined
  /** Alias of `background`. */
  backgroundColor?: string | undefined
  /** `color` → `label`, `fontSize` → `fontSize`. */
  textStyle?: { color?: string | undefined; fontSize?: number | undefined } | undefined
  /** Alias of `axis` (ECharts nests it under each axis; a theme sets it once). */
  axisLineColor?: string | undefined
  /** Alias of `grid`. */
  splitLineColor?: string | undefined
}

export interface ResolvedTheme {
  /** The palette the definition set, or null when it left the default. */
  palette: string[] | null
  chartTheme: ChartTheme
  background: string | undefined
}

const registry = new Map<string, ThemeDefinition>([
  ['light', {}],
  ['dark', { ...chartThemes.dark }],
])

/** The token subset of a definition, aliases folded in. */
function tokensOf(def: ThemeDefinition): Partial<ChartTheme> {
  const { color, backgroundColor, textStyle, axisLineColor, splitLineColor, ...tokens } = def
  const out: Partial<ChartTheme> = { ...tokens }
  if (out.palette === undefined && color !== undefined && color.length > 0) out.palette = color.slice()
  if (out.background === undefined && backgroundColor !== undefined) out.background = backgroundColor
  if (out.label === undefined && textStyle?.color !== undefined) out.label = textStyle.color
  if (out.fontSize === undefined && textStyle?.fontSize !== undefined) out.fontSize = textStyle.fontSize
  if (out.axis === undefined && axisLineColor !== undefined) out.axis = axisLineColor
  if (out.grid === undefined && splitLineColor !== undefined) out.grid = splitLineColor
  return out
}

/** Register (or replace) a named theme. */
export function registerTheme(name: string, theme: ThemeDefinition): void {
  registry.set(name, { ...theme })
}

/** A registered theme by name, or null. */
export function getTheme(name: string): ThemeDefinition | null {
  const t = registry.get(name)
  return t === undefined ? null : { ...t }
}

/** Registered theme names (built-ins first). */
export function listThemes(): string[] {
  return Array.from(registry.keys())
}

/** Resolve a theme name or inline definition into engine terms; an unknown name warns and falls back to light. */
export function resolveTheme(theme: string | ThemeDefinition | undefined, warnings?: OptionWarning[]): ResolvedTheme {
  let def: ThemeDefinition = {}
  if (typeof theme === 'string') {
    const found = registry.get(theme)
    if (found === undefined) {
      warnings?.push({ code: 'option-key-unsupported', path: 'theme', message: `Theme "${theme}" is not registered (registered: ${listThemes().join(', ')}); the light theme was used.` })
    } else def = found
  } else if (theme !== undefined) def = theme
  const tokens = tokensOf(def)
  const chartTheme = resolveChartTheme(defaultTheme, tokens)
  const palette = tokens.palette !== undefined && tokens.palette.length > 0 ? tokens.palette.slice() : null
  return { palette, chartTheme, background: tokens.background === '' ? undefined : tokens.background }
}
