// Chart themes — the light/dark token maps and how a host finds its theme
// (the named palettes live in palettes.ts so a host never bundles them): an explicit `theme` prop, else `<ChartThemeProvider>`, else
// the system colour scheme. Web-only (it reads `matchMedia` and provides
// context); the token SHAPE it fills is `ChartTheme` in render.ts, which is the
// part that crosses to native.

import { createContext, nativeCompat, provide, useContext } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { DARK_PALETTE } from './palette'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'


export type ChartThemeMode = 'light' | 'dark'

/**
 * The two built-in themes. `light` IS `defaultTheme`; `dark` lifts the palette,
 * drops text to a soft white, and raises the grid to ~16% alpha so it reads
 * on a dark ground without competing with the series.
 */
export const chartThemes: Readonly<Record<ChartThemeMode, ChartTheme>> = {
  light: defaultTheme,
  dark: {
    palette: DARK_PALETTE,
    background: '#141821',
    surface: '#1c2230',
    text: '#e6eaf2',
    label: '#9aa5b5',
    axis: '#5d6878',
    grid: 'rgba(154,165,181,0.16)',
    fontFamily: '',
    fontSize: 11.0,
    titleSize: 15.0,
    radius: 0.0,
    enterMs: 700.0,
    updateMs: 350.0,
  },
}

/**
 * The tooltip card's inline style for a theme: the `surface` token with a
 * subtle border from `grid`, text in `text`, the theme font. One place, so
 * every host's tooltip reads the same in both modes.
 */
export function tooltipStyle(theme: ChartTheme, fallbackFont: string): string {
  const font = theme.fontFamily === '' ? fallbackFont : theme.fontFamily
  return (
    'position:absolute;display:none;pointer-events:none;white-space:pre;' +
    `background:${theme.surface};color:${theme.text};border:1px solid ${theme.grid};` +
    `font:${theme.fontSize}px ${font};padding:6px 8px;border-radius:${Math.max(4, theme.radius)}px;` +
    'box-shadow:0 2px 8px rgba(0,0,0,0.12);z-index:1'
  )
}

/** A full theme from a base and an override; `undefined` fields never win. */
export function resolveChartTheme(base: ChartTheme, override?: Partial<ChartTheme> | undefined): ChartTheme {
  if (override === undefined) return base
  const out: ChartTheme = { ...base }
  for (const key of Object.keys(override) as (keyof ChartTheme)[]) {
    const v = override[key]
    if (v !== undefined) (out as unknown as Record<string, unknown>)[key] = v
  }
  return out
}

// ---------------------------------------------------------------------------
// System colour scheme — one `matchMedia` listener for the page.
//
// A module-level signal is the right home: there is exactly one system scheme
// per document, it lives as long as the document, and every chart reads the
// same value. The listener is attached lazily on first read (SSR never touches
// `matchMedia`) and is deliberately never removed — it is bound to the
// document's lifetime, not to any component's (leak class D needs a
// per-instance registration to pile up; this is one registration, ever).
// ---------------------------------------------------------------------------

let _systemMode: ReturnType<typeof signal<ChartThemeMode>> | null = null

/** The system colour scheme as a signal: `'dark'` under `prefers-color-scheme: dark`, else `'light'` (SSR: light). */
export function systemChartMode(): () => ChartThemeMode {
  if (_systemMode === null) {
    const s = signal<ChartThemeMode>('light')
    _systemMode = s
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      s.set(mq.matches ? 'dark' : 'light')
      mq.addEventListener('change', (e) => s.set(e.matches ? 'dark' : 'light'))
    }
  }
  return _systemMode
}

const systemTheme = (): ChartTheme => chartThemes[systemChartMode()()]

/**
 * The provided theme, as an accessor. The default is the SYSTEM theme, so a
 * chart with no provider and no `theme` prop already follows dark mode.
 * (A plain context holding an accessor, not a reactive context: the default
 * must itself be live — the system scheme can flip — and a reactive context's
 * default is a constant.)
 */
export const ChartThemeContext = createContext<() => ChartTheme>(systemTheme)

/** The theme in scope, as an accessor — read it inside an effect to track a mode flip. */
export function useChartTheme(): () => ChartTheme {
  return useContext(ChartThemeContext)
}

export interface ChartThemeProviderProps {
  /**
   * Pin the mode, or track an app's own: `<ChartThemeProvider mode={useMode}>`
   * hands PyreonUI's reactive mode straight through. Absent, the system
   * scheme decides.
   */
  mode?: ChartThemeMode | (() => ChartThemeMode) | undefined
  /** Overrides merged over the mode's theme — a palette, a font, a radius. A value or an accessor. */
  theme?: Partial<ChartTheme> | (() => Partial<ChartTheme> | undefined) | undefined
  children?: VNodeChild
}

/**
 * Provides a chart theme to every chart below it.
 *
 * ```tsx
 * <ChartThemeProvider mode={useMode} theme={{ palette: palettes.okabeIto }}>
 *   <PlotChart … />
 * </ChartThemeProvider>
 * ```
 */
function ChartThemeProviderImpl(props: ChartThemeProviderProps): VNodeChild {
  const parent = useContext(ChartThemeContext)
  const resolved = computed<ChartTheme>(() => {
    const m = props.mode
    const mode = typeof m === 'function' ? m() : m
    const base = mode === undefined ? parent() : chartThemes[mode]
    const t = props.theme
    return resolveChartTheme(base, typeof t === 'function' ? t() : t)
  })
  provide(ChartThemeContext, () => resolved())
  return props.children
}

export const ChartThemeProvider = nativeCompat(ChartThemeProviderImpl)
