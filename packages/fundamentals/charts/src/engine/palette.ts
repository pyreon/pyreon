// The series palette — ONE definition every family, host and executor reads.
//
// This file crosses to native (it is in the generated engine's ENGINE_FILES),
// so it stays inside the PMTC subset: a plain string list and an index
// function. Before it existed the same six hex values were copy-pasted into
// nine modules (marks, PieChart, treemap, sunburst, polar, family-svg, plus
// eight-colour variants in gantt/graph/river), which is why "change the series
// colours" was not expressible as a theme — see `ChartTheme.palette`.

/**
 * Pyreon's default series palette, in draw order.
 *
 * Chosen over the ECharts 6 tokens for a cleaner read on white AND on dark
 * grounds: a periwinkle primary, then coral / mint / violet / amber / sky /
 * pink / green, a slate neutral for "everything else" and a warm brown that
 * stays distinct from both the coral and the amber. Adjacent pairs differ in
 * hue AND lightness so a legend of two still reads under deuteranopia; the
 * `okabeIto` palette in `theme.ts` is the full colour-vision-safe set.
 */
import type { Double } from './types'

export const DEFAULT_PALETTE: readonly string[] = ['#4f7df3', '#f97362', '#22c3a6', '#a66cff', '#ffb020', '#2fb7e8', '#f45fa3', '#7bc950', '#8892a6', '#c47a3d']

/** The default palette lifted 8–12% for a dark ground — `chartThemes.dark`'s series colours. */
export const DARK_PALETTE: readonly string[] = ['#7b9bff', '#ff8f7e', '#4adbc0', '#bd93ff', '#ffc44d', '#5dcbf2', '#ff80be', '#9ad870', '#a3acbd', '#d8955e']

/** The palette colour for series `index`, cycling; an empty palette falls back to the default. */
export function paletteAt(palette: readonly string[], index: number): string {
  const n = palette.length
  if (n === 0) return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]!
  return palette[index % n]!
}

/**
 * One hex digit's value from its char code, or 0.
 *
 * Lives here rather than in a family because three of them wanted it and each
 * had written its own — `sankeyHexDigit` and treemap's `hexDigit` were
 * byte-identical, and chord would have been a third copy. `palette.ts` is
 * second in the native ENGINE_FILES order, so every family can reach it.
 */
export function hexDigit(c: Double): Double {
  if (c >= 48.0 && c <= 57.0) return c - 48.0
  if (c >= 97.0 && c <= 102.0) return c - 87.0
  if (c >= 65.0 && c <= 70.0) return c - 55.0
  return 0.0
}
