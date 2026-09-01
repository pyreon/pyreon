// Interaction wave: legend hit boxes + muted entries.

import { describe, expect, it } from 'vitest'
import { renderLegend } from './legend'
import type { LegendOptions } from './legend'

const OPTS: LegendOptions = {
  fontSize: 11,
  labelColor: '#5a6b7a',
  swatch: 10,
  gap: 12,
  orientation: 'horizontal',
}
const measure = (t: string): number => t.length * 6

describe('renderLegend hit boxes', () => {
  it('returns one box per entry, index-aligned, starting at the layout origin', () => {
    const l = renderLegend(
      [
        { label: 'Revenue', color: '#0f766e' },
        { label: 'Cost', color: '#b45309' },
      ],
      { x: 0, y: 0, w: 400, h: 100 },
      OPTS,
      measure,
    )
    expect(l.boxes).toHaveLength(2)
    expect(l.boxes[0]!.x).toBe(0)
    expect(l.boxes[0]!.y).toBe(0)
    // Second entry sits after the first on the same row.
    expect(l.boxes[1]!.x).toBeGreaterThan(l.boxes[0]!.w)
    expect(l.boxes[1]!.y).toBe(0)
    // A box covers its swatch and its text.
    expect(l.boxes[0]!.w).toBe(10 + 4 + measure('Revenue'))
    expect(l.boxes[0]!.h).toBeGreaterThan(0)
  })

  it('wrapped entries carry wrapped boxes — the hit rect matches the drawn row', () => {
    const l = renderLegend(
      [
        { label: 'A long series name', color: '#0f766e' },
        { label: 'Another long name', color: '#b45309' },
      ],
      { x: 0, y: 0, w: 140, h: 100 },
      OPTS,
      measure,
    )
    expect(l.boxes[1]!.y).toBeGreaterThan(l.boxes[0]!.y)
    expect(l.boxes[1]!.x).toBe(0)
  })

  it('empty input returns empty boxes, not a crash', () => {
    const l = renderLegend([], { x: 0, y: 0, w: 100, h: 100 }, OPTS, measure)
    expect(l.boxes).toEqual([])
    expect(l.height).toBe(0)
  })
})

describe('renderLegend muted entries', () => {
  it('a muted entry keeps its hue at reduced opacity; plain entries are untouched', () => {
    const plain = renderLegend(
      [{ label: 'S', color: '#0f766e' }],
      { x: 0, y: 0, w: 200, h: 50 },
      OPTS,
      measure,
    )
    const muted = renderLegend(
      [{ label: 'S', color: '#0f766e', muted: true }],
      { x: 0, y: 0, w: 200, h: 50 },
      OPTS,
      measure,
    )
    const swatch = (cmds: typeof plain.cmds) => cmds.find((c) => c.kind === 'rect')!
    const text = (cmds: typeof plain.cmds) => cmds.find((c) => c.kind === 'text')!
    expect(swatch(plain.cmds).fill).toBe('#0f766e')
    expect(swatch(muted.cmds).fill).toBe('rgba(15, 118, 110, 0.25)')
    expect(text(muted.cmds).fill).not.toBe(text(plain.cmds).fill)
  })
})
