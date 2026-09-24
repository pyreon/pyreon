// Chart themes — the light/dark token maps and how a host finds its theme
// (the named palettes live in palettes.ts so a host never bundles them): an
// explicit `theme` prop, else `<ChartThemeProvider>`, else the built-in theme
// for the framework-wide colour mode (`useColorMode` from @pyreon/core, which
// `<PyreonUI>` and `<ColorModeProvider>` set). Web-only (it provides context);
// the token SHAPE it fills is `ChartTheme` in render.ts, which is the part that
// crosses to native.

import { createContext, nativeCompat, provide, useColorMode, useContext } from '@pyreon/core'
import type { ColorMode, VNodeChild } from '@pyreon/core'
import { computed } from '@pyreon/reactivity'
import { DARK_PALETTE } from './palette'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'


/** The framework-wide colour mode (`ColorMode` from @pyreon/core). */
export type ChartThemeMode = ColorMode

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
    positive: '#22c55e',
    negative: '#f87171',
    muted: '#2a3140',
    ramp: ['#172033', '#1d4ed8', '#3b82f6', '#93c5fd'],
    fontFamily: '',
    fontSize: 11.0,
    titleSize: 15.0,
    radius: 3.0,
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

/**
 * What an explicit `<ChartThemeProvider>` hands down: the theme FOR a mode, not
 * a resolved theme. The mode is applied where the chart sits, so a
 * `<ColorModeProvider mode="dark">` below a provider still reaches the charts
 * under it. Null when there is no provider.
 */
export type ChartThemeLayer = (mode: ColorMode) => ChartTheme

export const ChartThemeContext = createContext<ChartThemeLayer | null>(null)

/**
 * The theme an EXPLICIT `<ChartThemeProvider>` above this component provides,
 * as an accessor, or `null` when none does.
 *
 * `<OptionChart>` needs the difference: a bare option chart keeps ECharts'
 * default (light) look, as ECharts itself ignores the OS scheme, while a
 * provider the app put there must win.
 */
export function useProvidedChartTheme(): (() => ChartTheme) | null {
  const layer = useContext(ChartThemeContext)
  if (layer === null) return null
  const mode = useColorMode()
  return () => layer(mode())
}

/**
 * The theme in scope, as an accessor — read it inside an effect to track a
 * mode flip. With no provider it is the built-in theme for the colour mode in
 * scope, so a chart below `<PyreonUI mode="dark">` is dark with no wiring.
 */
export function useChartTheme(): () => ChartTheme {
  const layer = useContext(ChartThemeContext) ?? builtIn
  const mode = useColorMode()
  return () => layer(mode())
}

const builtIn: ChartThemeLayer = (mode) => chartThemes[mode]

export interface ChartThemeProviderProps {
  /** Overrides merged over the mode's theme in BOTH modes — a palette, a font, a radius. A value or an accessor. */
  theme?: Partial<ChartTheme> | (() => Partial<ChartTheme> | undefined) | undefined
  /** Overrides for light mode only, applied over `theme` — a brand's ground or palette that differs by mode. */
  light?: Partial<ChartTheme> | undefined
  /** Overrides for dark mode only, applied over `theme`. */
  dark?: Partial<ChartTheme> | undefined
  children?: VNodeChild
}

/**
 * Provides a chart theme to every chart below it.
 *
 * ```tsx
 * <ChartThemeProvider theme={{ palette: palettes.okabeIto, radius: 6 }} dark={{ background: '#0b1020' }}>
 *   <Chart … />
 * </ChartThemeProvider>
 * ```
 *
 * The MODE is not a prop: it is the framework-wide colour mode, set by
 * `<PyreonUI mode>` or `<ColorModeProvider mode>` from @pyreon/core, so charts,
 * the UI system and every other component agree on it. The layers apply in
 * order: the mode's built-in theme (or an outer provider's), then `theme`
 * (both modes), then `light` or `dark` (the mode in effect where the chart
 * sits). Every layer is plain data, so the same provider lowers on iOS and
 * Android.
 */
function ChartThemeProviderImpl(props: ChartThemeProviderProps): VNodeChild {
  const parent = useContext(ChartThemeContext) ?? builtIn
  // One cached theme per mode: a chart reads its layer on every paint, and
  // rebuilding the merged token map each time would allocate per frame.
  const forMode = (m: ColorMode) =>
    computed<ChartTheme>(() => {
      const t = props.theme
      const shared = resolveChartTheme(parent(m), typeof t === 'function' ? t() : t)
      return resolveChartTheme(shared, m === 'dark' ? props.dark : props.light)
    })
  const light = forMode('light')
  const dark = forMode('dark')
  provide(ChartThemeContext, (m: ColorMode) => (m === 'dark' ? dark() : light()))
  return props.children
}

export const ChartThemeProvider = nativeCompat(ChartThemeProviderImpl)
