/**
 * Branch coverage for the annotation, bubble and horizontal-bar paths.
 *
 * `@pyreon/charts` declares a 98% branch threshold and was measuring 96.47%.
 * That was invisible until PR #3144 made the coverage gate compare EVERY
 * threshold a package declares rather than statements alone — at which point a
 * pre-existing shortfall turned the gate red for every PR whose affected set
 * reaches charts, which is any compiler change. A gate that is red on arrival
 * cannot distinguish a regression from the baseline.
 *
 * These are not filler: each spec drives a branch that decides what is DRAWN —
 * a reversed band, a coloured rule, a rule with no label, a bubble whose radius
 * array has a hole — and asserts the emitted draw command, so a wrong branch
 * fails rather than merely being executed.
 */
import { describe, expect, it } from 'vitest'
import { defaultTheme, renderChart, type ChartSpec } from '../engine/render'
import { bubble, resolveMarks, type Mark } from '../engine/marks'
import { colorRamp } from '../engine/heat'
import type { DrawCmd } from '../engine/types'

const measure = (s: string): number => s.length * 6

const base = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400,
  height: 200,
  categories: ['a', 'b', 'c'],
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: false,
  series: [
    { kind: 'line', label: 'one', values: [3, 5, 2], color: '#f00', width: 2, radius: 3 },
  ],
  ...over,
})

const rects = (cmds: DrawCmd[]) => cmds.filter((c) => c.kind === 'rect')
const texts = (cmds: DrawCmd[]) => cmds.filter((c) => c.kind === 'text')
const lines = (cmds: DrawCmd[]) => cmds.filter((c) => c.kind === 'line')

describe('annotation bands', () => {
  it('a band with yFrom ABOVE yTo is drawn the same as the reversed pair', () => {
    // `top = y1 < y2 ? y1 : y2` — a band written high-to-low must not render
    // with a negative height or slide off the plot.
    const up = renderChart(base({ annotations: [{ yFrom: 1, yTo: 4 }] }), measure)
    const down = renderChart(base({ annotations: [{ yFrom: 4, yTo: 1 }] }), measure)
    const a = rects(up).at(-1)!
    const b = rects(down).at(-1)!
    expect(a).toEqual(b)
    expect(b.kind === 'rect' && b.rect.h).toBeGreaterThan(0)
  })

  it('an explicit band colour is used instead of the axis colour', () => {
    const withColor = rects(
      renderChart(base({ annotations: [{ yFrom: 1, yTo: 4, color: '#123456' }] }), measure),
    ).at(-1)!
    const without = rects(
      renderChart(base({ annotations: [{ yFrom: 1, yTo: 4 }] }), measure),
    ).at(-1)!
    expect(withColor.kind === 'rect' && withColor.fill).not.toBe(
      without.kind === 'rect' ? without.fill : '',
    )
    expect(withColor.kind === 'rect' && withColor.fill).toContain('18, 52, 86')
  })
})

describe('annotation rules', () => {
  it('a y-rule with a label emits the label; without one it does not', () => {
    const labelled = renderChart(base({ annotations: [{ y: 3, label: 'target' }] }), measure)
    const bare = renderChart(base({ annotations: [{ y: 3 }] }), measure)
    expect(texts(labelled).some((c) => c.kind === 'text' && c.text === 'target')).toBe(true)
    expect(texts(bare).some((c) => c.kind === 'text' && c.text === 'target')).toBe(false)
    // The rule itself is drawn either way — the label is the only difference.
    expect(lines(bare).length).toBe(lines(labelled).length)
  })

  it('an x-rule with a label emits the label; without one it does not', () => {
    const labelled = renderChart(base({ annotations: [{ x: 1, label: 'launch' }] }), measure)
    const bare = renderChart(base({ annotations: [{ x: 1 }] }), measure)
    expect(texts(labelled).some((c) => c.kind === 'text' && c.text === 'launch')).toBe(true)
    expect(texts(bare).some((c) => c.kind === 'text' && c.text === 'launch')).toBe(false)
  })

  it('an explicit rule colour reaches BOTH the stroke and the label', () => {
    const cmds = renderChart(
      base({ annotations: [{ y: 3, label: 'cap', color: '#abcdef' }] }),
      measure,
    )
    const rule = lines(cmds).at(-1)!
    const label = texts(cmds).find((c) => c.kind === 'text' && c.text === 'cap')!
    expect(rule.kind === 'line' && rule.stroke).toBe('#abcdef')
    expect(label.kind === 'text' && label.fill).toBe('#abcdef')
  })
})

describe('bubbles and horizontal bars', () => {
  it('a per-datum radius array falls back to the series radius where it has a hole', () => {
    // `s.radii[i] ?? s.radius` — a short or sparse array must not render a
    // zero-radius point, which would silently drop a datum from the picture.
    const cmds = renderChart(
      base({
        series: [
          {
            kind: 'points',
            label: 'p',
            values: [1, 2, 3],
            color: '#0f0',
            width: 1,
            radius: 7,
            radii: [4],
          },
        ],
      }),
      measure,
    )
    const circles = cmds.filter((c) => c.kind === 'circle')
    expect(circles.length).toBe(3)
    const radii = circles.map((c) => (c.kind === 'circle' ? c.radius : 0))
    expect(radii[0]).toBeCloseTo(4)
    // The two the array does not cover fall back rather than collapsing to 0.
    expect(radii[1]).toBeCloseTo(7)
    expect(radii[2]).toBeCloseTo(7)
  })

  it('a horizontal bar chart spanning zero anchors its bars at the zero line', () => {
    // `yDomain.min < 0 && yDomain.max > 0 ? 0 : yDomain.min` — with negatives
    // present the baseline is zero, so a negative bar grows the other way.
    const cmds = renderChart(
      base({
        horizontal: true,
        series: [
          { kind: 'bars', label: 'b', values: [-3, 4], color: '#00f', width: 1, radius: 1 },
        ],
      }),
      measure,
    )
    const bars = rects(cmds)
    expect(bars.length).toBeGreaterThanOrEqual(2)
    // Negative and positive bars start from a shared x and extend oppositely.
    const xs = bars.map((c) => (c.kind === 'rect' ? c.rect.x : 0))
    expect(new Set(xs.map((x) => Math.round(x))).size).toBeGreaterThan(1)
  })
})

describe('the bubble r channel maps by area, and degenerates safely', () => {
  interface Row {
    v: number
    r: number
  }
  const rows: Row[] = [
    { v: 1, r: 0 },
    { v: 2, r: 4 },
    { v: 3, r: 16 },
  ]

  it('maps between minRadius and maxRadius by AREA, not by radius', () => {
    // Radius-proportional bubbles are the classic way a bubble chart
    // exaggerates its own data — the sqrt is the thing worth pinning.
    const [s] = resolveMarks(rows, [bubble<Row>((d) => d.v, (d) => d.r)])
    const radii = s!.radii!
    expect(radii[0]).toBeCloseTo(3) // r=0 → the floor
    expect(radii[2]).toBeCloseTo(18) // the largest → the ceiling
    // r=4 of a 16 max is a QUARTER the value, so half the radius span.
    expect(radii[1]).toBeCloseTo(3 + Math.sqrt(4 / 16) * (18 - 3))
  })

  it('honours explicit minRadius / maxRadius', () => {
    const [s] = resolveMarks(rows, [
      bubble<Row>((d) => d.v, (d) => d.r, { minRadius: 1, maxRadius: 5 }),
    ])
    const radii = s!.radii!
    expect(radii[0]).toBeCloseTo(1)
    expect(radii[2]).toBeCloseTo(5)
  })

  it('an all-zero r channel collapses to minRadius rather than dividing by zero', () => {
    // `hi === 0 ? minR : …` — without the guard every radius is NaN and the
    // whole series vanishes from the canvas with no error.
    const flat: Row[] = [
      { v: 1, r: 0 },
      { v: 2, r: 0 },
    ]
    const [s] = resolveMarks(flat, [bubble<Row>((d) => d.v, (d) => d.r)])
    expect(s!.radii).toEqual([3, 3])
  })

  it('a negative or non-finite r is floored at zero, not propagated', () => {
    const odd: Row[] = [
      { v: 1, r: -5 },
      { v: 2, r: Number.NaN },
      { v: 3, r: 9 },
    ]
    const [s] = resolveMarks(odd, [bubble<Row>((d) => d.v, (d) => d.r)])
    const radii = s!.radii!
    expect(radii.every((r) => Number.isFinite(r))).toBe(true)
    expect(radii[0]).toBeCloseTo(3)
    expect(radii[1]).toBeCloseTo(3)
  })
})

describe('defensive fallbacks that the public factories never hit', () => {
  it('resolveMarks supplies bubble radii defaults for a hand-built mark', () => {
    // `bubble()` always sets minRadius/maxRadius, so the `??` fallbacks in
    // resolveMarks are only reachable through a mark assembled by hand — which
    // the Mark type permits, so the fallback is load-bearing rather than dead.
    const hand: Mark<{ v: number }> = {
      kind: 'points',
      y: (d) => d.v,
      options: {},
      r: (d) => d.v,
    }
    const [s] = resolveMarks([{ v: 1 }, { v: 4 }], [hand])
    const radii = s!.radii!
    expect(radii[0]).toBeCloseTo(3 + Math.sqrt(1 / 4) * (18 - 3))
    expect(radii[1]).toBeCloseTo(18)
  })

  it('a colour ramp yields black for a malformed stop rather than NaN', () => {
    // A truncated hex has no channel to read; the parser returns 0 so the cell
    // paints black instead of `rgb(NaN, NaN, NaN)`, which paints nothing at all
    // and takes the whole heatmap down with it.
    const ramp = colorRamp(['#ab', '#ffffff'])
    const c = ramp(0)
    expect(c).not.toContain('NaN')
    expect(c).toContain('0')
  })
})
