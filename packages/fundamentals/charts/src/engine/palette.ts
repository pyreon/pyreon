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
 * Two measured properties, locked by `palette-contrast.test.ts`:
 *
 * - Every colour clears 3:1 against the light ground (WCAG 1.4.11, non-text
 *   contrast) — a line or a point is a graphical object the reader needs.
 * - The ORDER maximises the smallest colour difference of every prefix, for
 *   normal vision and simulated deuteranopia and protanopia, in both modes at
 *   once: a chart's first few series are the most distinct the set allows, and
 *   a series keeps its hue when the mode flips.
 *
 * Periwinkle, amber, teal, sky, clay, slate, pink, coral, green, violet.
 */
import type { Double } from './types'

export const DEFAULT_PALETTE: readonly string[] = ['#4f7df3', '#c88100', '#1ca28a', '#179dcd', '#c47a3d', '#8892a6', '#f4589f', '#f85f4c', '#5aa232', '#a66cff']

/** The same hues, in the same order, lifted for a dark ground — `chartThemes.dark`'s series colours. */
export const DARK_PALETTE: readonly string[] = ['#7b9bff', '#ffc44d', '#4adbc0', '#5dcbf2', '#d8955e', '#a3acbd', '#ff80be', '#ff8f7e', '#9ad870', '#bd93ff']

/** The palette colour for series `index`, cycling; an empty palette falls back to the default. */
/**
 * Each mark's palette slot, keyed by its LABEL: marks that share a label share
 * a colour (an area and a line both labelled Revenue are one series to the
 * reader, and the legend groups them into one entry), and each new label takes
 * the next slot. With all-distinct labels this is simply the mark index, so a
 * chart without shared labels is coloured exactly as before.
 */
export function labelSlots(labels: string[]): number[] {
  const seen: string[] = []
  const out: number[] = []
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!
    let slot = -1
    for (let k = 0; k < seen.length; k++) {
      if (seen[k] === label) slot = k
    }
    if (slot < 0) {
      slot = seen.length
      seen.push(label)
    }
    out.push(slot)
  }
  return out
}

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
