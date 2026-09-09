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
    // Grouped, so the LANE BAND is drawn. Threading the label through the
    // theme without the band under it made a dark gantt light-grey text on a
    // fixed near-white band — about 1.9:1, i.e. worse than before the theme
    // reached it at all. The band follows `grid`: a translucent neutral is
    // the one value that reads on both grounds.
    ['gantt (grouped lanes)', () => ganttToSvg({ tasks: [{ id: '1', name: 'D', start: '2024-01-01', end: '2024-01-10', group: 'Web' }, { id: '2', name: 'S', start: '2024-01-20', end: '2024-01-25', group: 'App' }], theme: dark }), [dark.label, dark.grid]],
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

describe('the gantt lane band follows its label', () => {
  // A themed label on an UNTHEMED band is worse than neither being themed:
  // before the theme reached the label, dark `#374151` text on near-white
  // `#f3f4f6` was readable on every ground. Threading only the label made a
  // dark gantt light-grey on near-white.
  const grouped = [
    { id: '1', name: 'D', start: '2024-01-01', end: '2024-01-10', group: 'Web' },
    { id: '2', name: 'S', start: '2024-01-20', end: '2024-01-25', group: 'App' },
  ]

  it('a dark gantt draws no fixed near-white band', () => {
    const svg = ganttToSvg({ tasks: grouped, width: 400, height: 220, theme: dark })
    expect(svg).not.toContain('#f3f4f6')
    expect(svg).toContain(dark.grid)
  })

  it('and an explicit laneColor still wins', () => {
    const svg = ganttToSvg({ tasks: grouped, width: 400, height: 220, theme: dark, gantt: { laneColor: '#123456' } })
    expect(svg).toContain('#123456')
  })

  it('the default theme is unchanged where it was already fine', () => {
    // The light ground kept working throughout; the band moves to the theme's
    // own neutral rather than staying a literal, so this asserts the VALUE
    // rather than that nothing moved.
    const svg = ganttToSvg({ tasks: grouped, width: 400, height: 220 })
    expect(svg).toContain(defaultTheme.grid)
    expect(svg).not.toContain('#f3f4f6')
  })
})

// A colour a family draws a MEANINGFUL mark in has to be readable on the ground
// its own theme paints. This is separate from the parity above: the two paths
// can agree perfectly and both be unreadable, which is exactly how graph and
// tree shipped — `linkColor` defaulted to a hardcoded `#94a3b8` that neither
// host ever overrode, so both halves drew the same slate. It reads at 6.93:1 on
// the dark ground and 2.56:1 on white, i.e. it was picked for dark (it is dark's
// own `label` #9aa5b5 to within (6, 2, -3)) and light was never checked. A graph
// without visible edges is a scatter plot, so this is WCAG 1.4.11 (non-text
// contrast, 3:1), not a preference.
describe('theme colour contrast', () => {
  /** WCAG 2.x relative luminance. */
  const luminance = (hex: string): number => {
    const h = hex.replace('#', '')
    const ch = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255)
    const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
  }
  const contrast = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi! + 0.05) / (lo! + 0.05)
  }

  // The light theme's `background` is '' — it inherits the page — so white is
  // both the realistic default and the worst case for a light-on-light failure.
  const grounds: ReadonlyArray<readonly [string, string]> = [
    ['light', '#ffffff'],
    ['dark', chartThemes.dark.background],
  ]

  // `grid` is deliberately excluded and deliberately faint (0.18/0.16 alpha):
  // a gridline is decorative chrome, and raising it to 3:1 would make it
  // compete with the series it exists to sit behind.
  const meaningful = ['label', 'axis'] as const

  for (const [mode, ground] of grounds) {
    const theme = mode === 'light' ? defaultTheme : chartThemes.dark
    for (const token of meaningful) {
      it(`${mode}: \`${token}\` clears 3:1 against its own ground`, () => {
        expect(contrast(theme[token], ground)).toBeGreaterThanOrEqual(3)
      })
    }
  }

  // Scope, stated because the name could be read wider than it is: this asserts
  // the SVG half. The canvas half is one `opts` line per component
  // (GraphChart/TreeChart) and `canvasHost` exposes no draw list, so there is
  // nothing to assert against without a pixel checksum — which this package has
  // already found blind on a fully-painted canvas. The native half rides the
  // `themeDefaults` registry in `@pyreon/native-compiler` and is covered by the
  // emit locks there.
  it('graph and tree links read a theme token, not the fixed slate, in the SVG path', () => {
    // Asserted on `stroke=`, not on the colour anywhere in the document: this
    // file's existing tree case already expects `dark.label` and passes with the
    // link unthemed, because tree draws its LABELS in that colour (a `fill`).
    // Only a link produces a stroke in it.
    const graphSvg = graphToSvg({
      nodes: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }],
      links: [{ source: 'a', target: 'b' }],
      theme: dark,
    })
    const treeSvg = treeToSvg({
      data: [{ name: 'docs', value: 30 }, { name: 'src', children: [{ name: 'core', value: 50 }] }],
      theme: dark,
    })
    for (const svg of [graphSvg, treeSvg]) {
      expect(svg).toContain(`stroke="${dark.label}"`)
      expect(svg).not.toContain('#94a3b8')
    }

    // …and it must MOVE with the theme, or a token that happened to match the
    // old constant would satisfy the above without being read at all.
    const lightGraph = graphToSvg({
      nodes: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }],
      links: [{ source: 'a', target: 'b' }],
    })
    expect(lightGraph).toContain(`stroke="${defaultTheme.label}"`)
    expect(lightGraph).not.toContain(`stroke="${dark.label}"`)
    expect(contrast(defaultTheme.label, '#ffffff')).toBeGreaterThanOrEqual(3)
  })
})
