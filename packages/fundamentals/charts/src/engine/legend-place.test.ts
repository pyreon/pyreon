// Legend PLACEMENT is the engine's, not the host's.
//
// The web host used to spell the four positions inline, so a native host could
// either re-derive them or — what it actually did — draw every legend at the
// top and warn that `legendPosition` does not lower. Worse, the two placements
// that DID exist disagreed: the native emit put the legend at x = 0 across the
// full width, the web host inset it by 8 on each side and pushed the plot 8
// further down. One function all three targets call is the same argument
// `chrome.ts` already won for legend entries and tooltips.

import { describe, expect, it } from 'vitest'
import { legendColumnWidth, placeLegend } from './legend'
import type { LegendEntry, LegendOptions } from './legend'
import type { DrawCmd, Double, Rect } from './types'

const measure = (t: string, _s: Double): Double => t.length * 6.0
const opts: LegendOptions = { fontSize: 10.0, labelColor: '#333', swatch: 10.0, gap: 10.0, orientation: 'horizontal' }
const entries: LegendEntry[] = [
  { label: 'alpha', color: '#111' },
  { label: 'beta', color: '#222' },
  { label: 'gamma', color: '#333' },
]
const area: Rect = { x: 0, y: 20, w: 400, h: 280 }
/** The top-left of a placement's own commands, which is where it actually drew. */
const bounds = (cmds: readonly DrawCmd[]): { x: Double; y: Double } => {
  let x = Number.POSITIVE_INFINITY
  let y = Number.POSITIVE_INFINITY
  for (const c of cmds) {
    const at = c.kind === 'rect' ? { x: c.rect.x, y: c.rect.y } : c.kind === 'text' ? c.at : undefined
    if (at === undefined) continue
    if (at.x < x) x = at.x
    if (at.y < y) y = at.y
  }
  return { x, y }
}

describe('placeLegend', () => {
  it('takes exactly ONE inset per position, and never more than one', () => {
    for (const [position, side] of [
      ['top', 'top'],
      ['bottom', 'bottom'],
      ['left', 'left'],
      ['right', 'right'],
    ] as const) {
      const p = placeLegend(entries, area, position, opts, measure)
      for (const key of ['top', 'bottom', 'left', 'right'] as const) {
        if (key === side) expect(p[key], `${position}.${key}`).toBeGreaterThan(0)
        else expect(p[key], `${position}.${key}`).toBe(0)
      }
      expect(p.cmds.length).toBeGreaterThan(0)
      expect(p.boxes).toHaveLength(entries.length)
    }
  })

  it('draws inside the area it was given, offset by the 8px pad the web host has always used', () => {
    const top = placeLegend(entries, area, 'top', opts, measure)
    expect(bounds(top.cmds).x).toBeGreaterThanOrEqual(area.x + 8)
    expect(bounds(top.cmds).y).toBeGreaterThanOrEqual(area.y + 8)
    // A bottom legend sits at the FOOT of the area, not the head.
    const bottom = placeLegend(entries, area, 'bottom', opts, measure)
    expect(bounds(bottom.cmds).y).toBeGreaterThan(area.y + area.h / 2)
    // A right legend starts past the middle; a left one does not.
    expect(bounds(placeLegend(entries, area, 'right', opts, measure).cmds).x).toBeGreaterThan(area.x + area.w / 2)
    expect(bounds(placeLegend(entries, area, 'left', opts, measure).cmds).x).toBeLessThan(area.x + area.w / 2)
  })

  it('a side legend is a COLUMN however the caller spelled `orientation`', () => {
    // The position decides the orientation, so a caller cannot ask for a
    // combination that lays out one way and measures another.
    const asked = placeLegend(entries, area, 'left', { ...opts, orientation: 'horizontal' }, measure)
    const wanted = placeLegend(entries, area, 'left', { ...opts, orientation: 'vertical' }, measure)
    expect(asked).toEqual(wanted)
    // Its width is the widest entry, capped at 40% of the area.
    expect(asked.left).toBeCloseTo(legendColumnWidth(entries, opts, measure) + 8, 5)
  })

  it('caps a side column at 40% of the area rather than crowding out the plot', () => {
    const long: LegendEntry[] = [{ label: 'a-very-long-series-name-indeed-quite-long', color: '#111' }]
    const p = placeLegend(long, area, 'left', opts, measure)
    expect(p.left).toBeCloseTo(area.w * 0.4 + 8, 5)
  })

  it('takes nothing at all for an empty legend', () => {
    const p = placeLegend([], area, 'left', opts, measure)
    expect(p).toEqual({ cmds: [], top: 0, bottom: 0, left: 0, right: 0, boxes: [] })
  })
})
