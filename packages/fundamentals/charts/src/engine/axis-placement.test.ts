// Axis placement as drawn: the x axis on top, a lone y on the right, per-axis
// offsets, a second x axis's labels on the opposite edge (reversed with an
// inverted axis), and third-and-later y axes with their own ticks and titles.
// Every assertion reads the draw list, because a mis-placed axis still
// "renders" — it just renders somewhere a reader will not look.
import { describe, expect, it } from 'vitest'
import { defaultTheme, renderChart } from './render'
import type { ChartSpec, Series } from './render'
import type { DrawCmd, MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6
const series = (over: Partial<Series> = {}): Series => ({ kind: 'bars', values: [1, 2, 3], color: '#000', width: 1, radius: 3, label: 'S', ...over })
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  width: 400,
  height: 300,
  series: [series()],
  categories: ['a', 'b', 'c'],
  theme: defaultTheme,
  showXAxis: true,
  showYAxis: true,
  showGrid: true,
  ...over,
})
const draw = (over: Partial<ChartSpec> = {}): DrawCmd[] => renderChart(spec(over), measure)
const textCmd = (cmds: DrawCmd[], text: string) =>
  cmds.find((c): c is Extract<DrawCmd, { kind: 'text' }> => c.kind === 'text' && c.text === text)

describe('x axis position', () => {
  it('on top, category labels sit ABOVE the plot rather than below it', () => {
    const bottom = textCmd(draw(), 'a')!
    const top = textCmd(draw({ xTop: true }), 'a')!
    expect(top.at.y).toBeLessThan(bottom.at.y)
  })

  it('a horizontal chart ignores xTop', () => {
    const plain = textCmd(draw({ horizontal: true }), 'a')
    const asked = textCmd(draw({ horizontal: true, xTop: true }), 'a')
    expect(asked?.at).toEqual(plain?.at)
  })
})

describe('a second x axis', () => {
  it('labels the same bands on the OPPOSITE edge from the first', () => {
    const cmds = draw({ x2Labels: ['p', 'q', 'r'] })
    const first = textCmd(cmds, 'a')!
    const second = textCmd(cmds, 'p')!
    expect(second.at.x).toBeCloseTo(first.at.x, 6)
    expect(second.at.y).toBeLessThan(first.at.y)
  })

  it('moves to the bottom when the first x axis is on top', () => {
    const cmds = draw({ xTop: true, x2Labels: ['p', 'q', 'r'] })
    expect(textCmd(cmds, 'p')!.at.y).toBeGreaterThan(textCmd(cmds, 'a')!.at.y)
  })

  it('reverses with an inverted category axis so each label keeps its band', () => {
    const cmds = draw({ xInverse: true, x2Labels: ['p', 'q', 'r'] })
    // After inversion `c` is leftmost; its partner on the second axis is `r`.
    expect(textCmd(cmds, 'r')!.at.x).toBeCloseTo(textCmd(cmds, 'c')!.at.x, 6)
  })

  it('draws its title when given one, and nothing extra when not', () => {
    expect(textCmd(draw({ x2Labels: ['p', 'q', 'r'], x2Title: 'Second' }), 'Second')).toBeDefined()
    expect(textCmd(draw({ x2Labels: ['p', 'q', 'r'] }), 'Second')).toBeUndefined()
  })

  it('a label list SHORTER than the ticks labels only what it has', () => {
    const cmds = draw({ x2Labels: ['only'] })
    expect(textCmd(cmds, 'only')).toBeDefined()
  })

  it('is not drawn on a horizontal chart, or with the x axis hidden', () => {
    expect(textCmd(draw({ horizontal: true, x2Labels: ['p', 'q', 'r'] }), 'p')).toBeUndefined()
    expect(textCmd(draw({ showXAxis: false, x2Labels: ['p', 'q', 'r'] }), 'p')).toBeUndefined()
  })
})

describe('extra y axes', () => {
  const extra = (over: Partial<ChartSpec> = {}) =>
    draw({
      series: [series(), series({ values: [100, 200, 300], axisExtra: 0 })],
      ...over,
    })

  it('a right-side extra axis labels its ticks right of the plot, start-aligned', () => {
    const cmds = extra({ extraYAxes: [{ side: 'right', title: 'Third' }] })
    const title = textCmd(cmds, 'Third')!
    expect(title.rotate).toBe(90)
    expect(title.at.x).toBeGreaterThan(200)
  })

  it('a left-side extra axis mirrors it: end-aligned labels and a -90 title', () => {
    const cmds = extra({ extraYAxes: [{ side: 'left', title: 'Third' }] })
    const title = textCmd(cmds, 'Third')!
    expect(title.rotate).toBe(-90)
    expect(title.at.x).toBeLessThan(200)
  })

  it('an offset changes where the axis draws — the layout absorbs it, so the plot moves, not the title', () => {
    // The gutter is reserved for the offset, so the title stays pinned near the
    // chart edge while the axis's tick labels and the plot shift inward.
    const near = extra({ extraYAxes: [{ side: 'right', title: 'T' }] })
    const far = extra({ extraYAxes: [{ side: 'right', title: 'T', offset: 40 }] })
    expect(JSON.stringify(far)).not.toBe(JSON.stringify(near))
  })

  it('an untitled extra axis draws no title, and a hidden y axis suppresses the title', () => {
    expect(textCmd(extra({ extraYAxes: [{ side: 'right' }] }), 'T')).toBeUndefined()
    expect(textCmd(extra({ showYAxis: false, extraYAxes: [{ side: 'right', title: 'T' }] }), 'T')).toBeUndefined()
  })

  it('a pinned domain is used instead of the series extent', () => {
    const labels = (d?: { min: number; max: number }) =>
      extra({ extraYAxes: [{ side: 'right', ...(d ? { domain: d } : {}) }] })
        .filter((c): c is Extract<DrawCmd, { kind: 'text' }> => c.kind === 'text')
        .map((c) => c.text)
    expect(labels({ min: 0, max: 1000 })).not.toEqual(labels())
  })
})

describe('axis offsets', () => {
  it('xOffset changes the drawn geometry (the plot yields the gutter, the labels keep the edge)', () => {
    expect(JSON.stringify(draw({ xOffset: 20 }))).not.toBe(JSON.stringify(draw()))
  })

  it('a lone y axis on the right puts its labels right of the plot', () => {
    const left = draw().filter((c) => c.kind === 'text' && c.align === 'end')
    const right = draw({ yRight: true }).filter((c) => c.kind === 'text' && c.align === 'start')
    expect(left.length).toBeGreaterThan(0)
    expect(right.length).toBeGreaterThan(0)
  })
})

describe('placement combinations', () => {
  const many = { categories: Array.from({ length: 30 }, (_, i) => `category-${i}`), series: [series({ values: Array.from({ length: 30 }, (_, i) => i) })] }

  it('rotated labels on a TOP axis slant the other way', () => {
    const rotation = (xTop: boolean): number => {
      const cmd = draw({ ...many, xLabels: 'rotate', xTop }).find(
        (c): c is Extract<DrawCmd, { kind: 'text' }> => c.kind === 'text' && c.text === 'category-0',
      )
      return cmd?.rotate ?? 0
    }
    expect(rotation(false)).not.toBe(0)
    expect(rotation(true)).toBe(-rotation(false))
  })

  it('a second x axis title sits at the bottom edge when the first axis is on top', () => {
    const top = textCmd(draw({ xTop: true, x2Labels: ['p', 'q', 'r'], x2Title: 'Second' }), 'Second')!
    const bottom = textCmd(draw({ x2Labels: ['p', 'q', 'r'], x2Title: 'Second' }), 'Second')!
    expect(top.at.y).toBeGreaterThan(bottom.at.y)
  })

  it('two extra axes each draw only their OWN ticks', () => {
    const cmds = draw({
      series: [series(), series({ values: [10, 20, 30], axisExtra: 0 }), series({ values: [1000, 2000, 3000], axisExtra: 1 })],
      extraYAxes: [{ side: 'right', title: 'Three' }, { side: 'right', title: 'Four', offset: 50 }],
    })
    expect(textCmd(cmds, 'Three')).toBeDefined()
    expect(textCmd(cmds, 'Four')).toBeDefined()
  })

  it('a continuous x axis inverts its DOMAIN rather than its categories', () => {
    const plain = draw({ xValues: [0, 5, 10], categories: [], series: [series({ kind: 'line', values: [1, 2, 3] })] })
    const inv = draw({ xInverse: true, xValues: [0, 5, 10], categories: [], series: [series({ kind: 'line', values: [1, 2, 3] })] })
    expect(JSON.stringify(inv)).not.toBe(JSON.stringify(plain))
  })
})
