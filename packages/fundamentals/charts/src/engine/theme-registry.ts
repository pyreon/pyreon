// Theme registry — ECharts-shaped named themes over the engine's ChartTheme.
//
// A module-level Map is the right home here: themes are static configuration
// registered at startup (never per render), bounded by the number of names an
// app registers, and looked up by name from the option facade.

import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import type { OptionWarning } from './option'

export interface ThemeDefinition {
  /** Series palette, in order. */
  color?: string[] | undefined
  backgroundColor?: string | undefined
  textStyle?: { color?: string | undefined; fontSize?: number | undefined } | undefined
  /** Axis line colour (ECharts nests it under each axis; a theme sets it once). */
  axisLineColor?: string | undefined
  /** Grid line colour. */
  splitLineColor?: string | undefined
}

export interface ResolvedTheme {
  palette: string[] | null
  chartTheme: ChartTheme
  background: string | undefined
}

const DARK: ThemeDefinition = {
  color: ['#4992ff', '#7cffb2', '#fddd60', '#ff6e76', '#58d9f9', '#05c091', '#ff8a45', '#8d48e3', '#dd79ff'],
  backgroundColor: '#100c2a',
  textStyle: { color: '#b9b8ce' },
  axisLineColor: '#6e7079',
  splitLineColor: 'rgba(110,112,121,0.35)',
}

const registry = new Map<string, ThemeDefinition>([
  ['light', {}],
  ['dark', DARK],
])

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
  const chartTheme: ChartTheme = {
    axis: def.axisLineColor ?? defaultTheme.axis,
    grid: def.splitLineColor ?? defaultTheme.grid,
    label: def.textStyle?.color ?? defaultTheme.label,
    fontSize: def.textStyle?.fontSize ?? defaultTheme.fontSize,
  }
  const palette = def.color !== undefined && def.color.length > 0 ? def.color.slice() : null
  return { palette, chartTheme, background: def.backgroundColor }
}
