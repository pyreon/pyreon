// The static/SSR `*ToSvg` helpers and their canvas hosts draw the same chart.
// Before this suite the SVG half inlined light-mode literals — `gaugeToSvg`
// drew its value arc `#0f766e` where `<GaugeChart>` drew `theme.palette[0]`
// (`#4f7df3`), and eleven families drew chrome text in a fixed slate that is
// unreadable on a dark ground. Two invariants, both needed:
//
//   1. a themed helper must ACTUALLY read the theme — a helper that accepts
//      `theme` and ignores it satisfies nothing, so every case asserts the
//      dark value is present AND the light default is gone;
//   2. the value it reads must be the field its CANVAS twin reads — asserting
//      only "some colour changed" would pass on a helper reading the wrong one.
import { describe, expect, it } from 'vitest'
import { renderGauge } from './arc'
import { renderRadar } from './radar'
import { paletteAt } from './palette'
import { chartThemes } from './theme'
import { defaultTheme } from './render'
import {
  calendarToSvg,
  ganttToSvg,
  gaugeToSvg,
  graphToSvg,
  parallelToSvg,
  pieToSvg,
  polarToSvg,
  radarToSvg,
  sankeyToSvg,
  treeToSvg,
} from './family-svg'

const dark = chartThemes.dark

describe('static SVG ⇄ canvas theme parity', () => {
  it('gaugeToSvg draws the arc, track and value in the fields <GaugeChart> reads', () => {
    // The exact option object `PieChart.tsx`'s gauge branch builds.
    const canvas = renderGauge(64, { x: 0, y: 0, w: 320, h: 320 }, {
      min: 0,
      max: 100,
      sweep: Math.PI,
      thickness: 22,
      trackColor: defaultTheme.grid,
      valueColor: paletteAt(defaultTheme.palette, 0),
    })
    const canvasFills = new Set(
      canvas.map((c) => (c as { fill?: string }).fill).filter((f): f is string => f !== undefined),
    )
    const svg = gaugeToSvg({ value: 64, width: 320, height: 160 })
    for (const fill of canvasFills) expect(svg).toContain(`fill="${fill}"`)
    // …and the value text, which only the SVG half draws in its own colour.
    expect(svg).toContain(`fill="${defaultTheme.text}"`)
    // The three literals it used to inline are gone.
    expect(svg).not.toContain('#0f766e')
    expect(svg).not.toContain('#10161d')
    expect(svg).not.toContain('rgba(132,150,165,0.22)')
  })

  it('radarToSvg rings use theme.grid, as <RadarChart> does', () => {
    const series = [{ v: [1, 2, 3] }]
    const svg = radarToSvg({
      data: series,
      axes: [{ label: 'a', max: 4 }, { label: 'b', max: 4 }, { label: 'c', max: 4 }],
      values: (d: { v: number[] }) => d.v,
      label: () => 'S',
    })
    const canvas = renderRadar(
      [{ label: 'a', max: 4 }, { label: 'b', max: 4 }, { label: 'c', max: 4 }],
      [{ values: [1, 2, 3], color: paletteAt(defaultTheme.palette, 0), fillAlpha: 0.25 }],
      { x: 0, y: 0, w: 320, h: 260 },
      { rings: 4, gridColor: defaultTheme.grid, labelColor: defaultTheme.label, fontSize: defaultTheme.fontSize, showLabels: true },
    )
    const strokes = new Set(
      canvas.map((c) => (c as { stroke?: string }).stroke).filter((s): s is string => s !== undefined),
    )
    expect(strokes.has(defaultTheme.grid)).toBe(true)
    expect(svg).toContain(defaultTheme.grid)
    expect(svg).not.toContain('rgba(132,150,165,0.35)')
  })

  // Every helper whose canvas twin defaults a chrome colour from the theme.
  const cases: ReadonlyArray<readonly [string, () => string, readonly string[]]> = [
    ['pie', () => pieToSvg({ data: [{ v: 1 }], value: (d: { v: number }) => d.v, label: () => 'a', showLegend: true, theme: dark }), [dark.label]],
    ['gauge', () => gaugeToSvg({ value: 3, theme: dark }), [dark.text, dark.grid]],
    ['radar', () => radarToSvg({ data: [{ v: [1, 2, 3] }], axes: [{ label: 'a', max: 4 }, { label: 'b', max: 4 }, { label: 'c', max: 4 }], values: (d: { v: number[] }) => d.v, label: () => 's', theme: dark }), [dark.grid, dark.label]],
    ['tree', () => treeToSvg({ data: [{ name: 'docs', value: 30 }, { name: 'src', children: [{ name: 'core', value: 50 }] }], theme: dark }), [dark.label]],
    ['sankey', () => sankeyToSvg({ nodes: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 5 }], theme: dark }), [dark.label]],
    ['graph', () => graphToSvg({ nodes: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }], links: [{ source: 'a', target: 'b' }], graph: { showLabels: true }, theme: dark }), [dark.label]],
    ['polar', () => polarToSvg({ axes: { categories: ['a', 'b'] }, series: [{ name: 's', kind: 'bar', values: [1, 2] }], theme: dark }), [dark.label, dark.grid]],
    ['calendar', () => calendarToSvg({ start: '2024-01-01', end: '2024-02-11', values: { '2024-01-03': 3 }, theme: dark }), [dark.label]],
    ['gantt', () => ganttToSvg({ tasks: [{ id: '1', name: 'Design', start: '2024-01-01', end: '2024-01-10' }], theme: dark }), [dark.label, dark.grid]],
    ['parallel', () => parallelToSvg({ axes: [{ name: 'a' }, { name: 'b' }], rows: [[1, 10], [2, 20]], theme: dark }), [dark.label, dark.axis]],
  ]

  for (const [name, render, expected] of cases) {
    it(`${name}ToSvg renders its chrome from the supplied theme`, () => {
      const svg = render()
      for (const colour of expected) expect(svg, `${name}: expected ${colour}`).toContain(colour)
      // The light default must be GONE — otherwise the helper is drawing chrome
      // it never routed through the theme at all.
      expect(svg, `${name}: still carries the light label`).not.toContain(defaultTheme.label)
    })
  }
})
