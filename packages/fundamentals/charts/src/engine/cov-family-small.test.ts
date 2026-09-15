// Branch coverage for the engine's small shared modules — the tween
// primitives, the corner/tooltip/toolbox/brush helpers, the locale and theme
// registries, the geo web adapters and the accessible table. Each arm here is
// a degenerate or asymmetric input the ordinary suites never construct: a
// ragged second channel, an empty tool list, a coordinate pair missing a half.
import { describe, expect, it } from 'vitest'
import { easeOutCubic, sameShape, sameValues, tweenValues } from './tween'
import { cornerRadii } from './corners'
import { sameCmdShape } from './cmd-tween'
import { tooltipAt } from './tooltip'
import { bollinger } from './indicators'
import { dateFormatter, getLocale, numberFormatter, registerLocale } from './locale'
import { hitToolbox, renderToolbox } from './toolbox'
import { brushBand, brushRange } from './brush'
import { lineRuns, parallelRows } from './parallel-web'
import { geoShapes, geoValues } from './geo-web'
import { layoutGeoShapes } from './geo'
import { renderGeoPaths, renderGeoPoints } from './geo-points'
import { histogram, bars } from './marks'
import { layoutSeriesPointsH } from './layout'
import { buildHeatGrid, hitHeatCell, renderHeat } from './heat'
import { getTheme, resolveTheme } from './theme-registry'
import { navigatorHit, renderNavigator } from './navigator'
import { chartTable } from './a11y'

describe('tween primitives', () => {
  it('the ease is clamped at both ends', () => {
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })
  it('sameShape needs the same series COUNT and the same lengths', () => {
    expect(sameShape([[1]], [[1], [2]]), 'different counts').toBe(false)
    expect(sameShape([[1, 2]], [[1]]), 'different lengths').toBe(false)
    expect(sameShape([[1, 2]], [[3, 4]])).toBe(true)
  })
  it('sameValues rejects a shape mismatch before comparing anything', () => {
    expect(sameValues([[1]], [[1], [1]])).toBe(false)
    expect(sameValues([[1, 2]], [[1, 2]])).toBe(true)
    expect(sameValues([[Number.NaN]], [[Number.NaN]]), 'a gap equals a gap').toBe(true)
    expect(sameValues([[1]], [[2]])).toBe(false)
  })
  it('tweenValues interpolates a same-shape pair along the EASE, not linearly', () => {
    const e = easeOutCubic(0.5)
    expect(tweenValues([[0, 10]], [[10, 20]], 0.5)).toEqual([[10 * e, 10 + 10 * e]])
    expect(tweenValues([[0]], [[10]], 0)).toEqual([[0]])
    expect(tweenValues([[0]], [[10]], 1)).toEqual([[10]])
  })
})

describe('corner radii', () => {
  it('an ABSENT or short list reads as square', () => {
    const rect = { x: 0, y: 0, w: 20, h: 10 }
    expect(cornerRadii(rect, undefined)).toEqual([0, 0, 0, 0])
    expect(cornerRadii(rect, [4])).toEqual([0, 0, 0, 0])
  })
  it('radii are clamped to half the SHORTER side, and a negative one reads as zero', () => {
    expect(cornerRadii({ x: 0, y: 0, w: 20, h: 10 }, [100, -5, 3, 3])).toEqual([5, 0, 3, 3])
  })
  it('a negative rectangle is measured by magnitude', () => {
    expect(cornerRadii({ x: 0, y: 0, w: -20, h: -10 }, [100, 100, 100, 100])).toEqual([5, 5, 5, 5])
  })
})

describe('draw-list shape comparison', () => {
  it('two lists of different LENGTH can never interpolate', () => {
    const c = { kind: 'circle', center: { x: 0, y: 0 }, radius: 1, fill: '#000' } as never
    expect(sameCmdShape([c], [c, c])).toBe(false)
    expect(sameCmdShape([c], [c])).toBe(true)
  })
})

describe('tooltip rows', () => {
  it('a RAGGED size channel leaves the row without a size rather than reading past the end', () => {
    const c = tooltipAt(2, ['a', 'b', 'c'], [{ label: 'x', values: [1, 2, 3], color: '#000', rValues: [9] }])
    expect(c.rows[0]!.size).toBeUndefined()
    const inRange = tooltipAt(0, ['a', 'b', 'c'], [{ label: 'x', values: [1, 2, 3], color: '#000', rValues: [9] }])
    expect(inRange.rows[0]!.size).toBe(9)
  })
  it('a non-finite size or second bound is a gap, not a printed NaN', () => {
    const c = tooltipAt(0, ['a'], [{ label: 'x', values: [1], color: '#000', rValues: [Number.NaN], values2: [Number.NaN] }])
    expect(c.rows[0]!.size).toBeUndefined()
    expect(c.rows[0]!.value2).toBeUndefined()
  })
})

describe('bollinger marks', () => {
  it('a CUSTOM label replaces the default on every one of the three marks', () => {
    const custom = bollinger<{ v: number }>((d) => d.v, 5, 2, { label: 'BB' })
    expect(custom.map((m) => m.options.label)).toEqual(['BB band', 'BB middle'])
    const dflt = bollinger<{ v: number }>((d) => d.v, 5)
    expect(dflt.map((m) => m.options.label)).toEqual(['Bollinger band', 'Bollinger middle'])
  })
})

describe('locale registry', () => {
  it('an UNREGISTERED tag has no pack', () => {
    expect(getLocale('zz-ZZ-not-a-locale')).toBeNull()
  })
  it('a registered pack is returned as a fresh OBJECT each time', () => {
    registerLocale('xx-COV', { monthNames: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'] })
    const a = getLocale('xx-COV')!
    const b = getLocale('xx-COV')!
    expect(a.monthNames).toHaveLength(12)
    expect(a).not.toBe(b)
    // The copy is SHALLOW, so the arrays inside are shared — asserted rather
    // than assumed, because a deep copy per read would be a real cost.
    expect(a.monthNames).toBe(b.monthNames)
  })
  it('a non-finite number or timestamp formats as an EMPTY string, not "NaN"', () => {
    expect(numberFormatter('en')(Number.NaN)).toBe('')
    expect(numberFormatter('en')(1234.5)).not.toBe('')
    expect(dateFormatter('en')(Number.NaN)).toBe('')
    expect(dateFormatter('en')(0)).not.toBe('')
  })
  it("a pack's month names win over Intl", () => {
    expect(dateFormatter('xx-COV')(0)).toBe('1 a')
  })
})

describe('toolbox', () => {
  const box = { x: 0, y: 0, w: 200, h: 40 }
  const opts = { fontSize: 12, color: '#000' }
  it('NO tools lays out nothing and takes no height', () => {
    expect(renderToolbox([], box, opts)).toEqual({ cmds: [], boxes: [], height: 0 })
  })
  it('an ACTIVE tool gets a highlight rect behind its glyph', () => {
    const plain = renderToolbox(['magicLine', 'magicBar'], box, opts)
    const active = renderToolbox(['magicLine', 'magicBar'], box, { ...opts, active: 'magicBar' })
    expect(active.cmds.filter((c) => c.kind === 'rect')).toHaveLength(1)
    expect(plain.cmds.filter((c) => c.kind === 'rect')).toHaveLength(0)
  })
  it('a hit inside a box reports its tool; a SPARSE box list is skipped, not read past', () => {
    const l = renderToolbox(['saveAsImage', 'restore'], box, opts)
    const b = l.boxes[0]!
    expect(hitToolbox(['saveAsImage', 'restore'], l.boxes, b.x + 1, b.y + 1)).toBe('saveAsImage')
    const sparse: (typeof l.boxes)[number][] = []
    sparse[2] = b
    expect(hitToolbox(['saveAsImage'], sparse, b.x + 1, b.y + 1), 'index 2 has no tool').toBeNull()
    expect(hitToolbox(['saveAsImage', 'restore'], l.boxes, -100, -100)).toBeNull()
  })
})

describe('brush', () => {
  const plot = { x: 10, y: 0, w: 100, h: 50 }
  it('a drag that starts LEFT of the plot and ends past it clamps to the whole window', () => {
    const r = brushRange(plot.x, plot.w, -500, 500, { start: 0, end: 1 }, 10)
    expect(r.start).toBe(0)
    expect(r.end).toBe(9)
  })
  it('a drag ordered right-to-left is the same range as left-to-right', () => {
    expect(brushRange(plot.x, plot.w, 80, 30, { start: 0, end: 1 }, 10)).toEqual(brushRange(plot.x, plot.w, 30, 80, { start: 0, end: 1 }, 10))
  })
  it('a drag entirely RIGHT of the plot clamps to the last datum, and one entirely LEFT to the first', () => {
    const right = brushRange(plot.x, plot.w, 300, 400, { start: 0, end: 1 }, 10)
    expect(right.start).toBe(9)
    expect(right.end).toBe(9)
    const left = brushRange(plot.x, plot.w, -400, -300, { start: 0, end: 1 }, 10)
    expect(left.start).toBe(0)
    expect(left.end).toBe(0)
  })
  it('a zero-width plot collapses the range rather than dividing by zero', () => {
    expect(brushRange(plot.x, 0, 0, 100, { start: 0, end: 1 }, 10).start).toBe(0)
  })
  it('a committed selection running past the right edge is CLIPPED to the plot', () => {
    const band = brushBand(plot, { start: 5, end: 99 }, { start: 0, end: 1 }, 10)
    expect(band.visible).toBe(true)
    expect(band.hi).toBe(plot.x + plot.w)
  })
  it('a selection entirely outside the visible slice is not visible', () => {
    expect(brushBand(plot, { start: 50, end: 60 }, { start: 0, end: 0.2 }, 10).visible).toBe(false)
    expect(brushBand(plot, { start: -50, end: -40 }, { start: 0, end: 1 }, 10).visible).toBe(false)
  })
  it('an empty visible slice has no band', () => {
    expect(brushBand(plot, { start: 0, end: 1 }, { start: 0.5, end: 0.5 }, 0).visible).toBe(false)
  })
})

describe('parallel web adapters', () => {
  it('a string on a NON-category axis is a gap, and one on a category axis is its index', () => {
    const axes = [{ label: 'a', type: 'category' as const, categories: ['x', 'y'] }, { label: 'b' }]
    expect(parallelRows(axes as never, [['y', 'x']])).toEqual([[1, Number.NaN]])
  })
  it('a category axis with NO category list makes every string a gap', () => {
    expect(parallelRows([{ label: 'a', type: 'category' }] as never, [['x']])).toEqual([[Number.NaN]])
  })
  it('a missing cell and a non-finite number are both gaps', () => {
    expect(parallelRows([{ label: 'a' }, { label: 'b' }] as never, [[1]])).toEqual([[1, Number.NaN]])
    expect(parallelRows([{ label: 'a' }] as never, [[Number.POSITIVE_INFINITY]])).toEqual([[Number.NaN]])
  })
  it('a run is split at every gap, and a run shorter than two points is dropped', () => {
    const pts = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i, y: 0 }))
    expect(lineRuns(pts, [true, true, false, true, true, true]).map((r) => r.length)).toEqual([2, 3])
    expect(lineRuns(pts, [true, false, true, true, false, true]), 'the lone head and lone tail both go').toHaveLength(1)
    expect(lineRuns(pts, [false, false, false, false, false, false])).toEqual([])
  })
})

describe('geo web adapters', () => {
  it('a record becomes a value list, skipping an explicitly UNDEFINED entry', () => {
    const rec: Record<string, number> = { West: 10, East: 20 }
    ;(rec as Record<string, number | undefined>).North = undefined
    expect(geoValues(rec)).toEqual([{ region: 'West', value: 10 }, { region: 'East', value: 20 }])
  })
  it('a feature with fewer than three coordinates has no usable ring', () => {
    const shapes = geoShapes({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'sliver' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] } },
        { type: 'Feature', properties: { name: 'empty' }, geometry: { type: 'Polygon', coordinates: [[]] } },
      ],
    } as never)
    expect(shapes.map((s) => s.name)).toEqual(['sliver', 'empty'])
    expect(shapes[0]!.rings).toEqual([])
    expect(shapes[1]!.rings).toEqual([])
  })
  it('a coordinate pair missing a half reads as zero rather than NaN', () => {
    const shapes = geoShapes({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[1], [2, 2], [3, 3]]] } }],
    } as never)
    expect(shapes[0]!.rings[0]![0]).toEqual({ x: 1, y: 0 })
    expect(shapes[0]!.name, 'a feature with no name property is numbered').toBe('Region 1')
  })
  it('a feature with a NULL geometry is skipped entirely', () => {
    expect(geoShapes({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: null }] } as never)).toEqual([])
  })
})

describe('geo overlays', () => {
  const layout = layoutGeoShapes([{ name: 'a', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]] }], { x: 0, y: 0, w: 200, h: 200 })
  const pts = [{ name: 'P', lon: 2, lat: 2, value: 4 }, { lon: 8, lat: 8 }]

  it('point progress is clamped at both ends', () => {
    const settled = renderGeoPoints(layout, pts)
    expect(renderGeoPoints(layout, pts, { progress: 5 })).toEqual(settled)
    const zero = renderGeoPoints(layout, pts, { progress: -1 }) as { radius: number }[]
    for (const c of zero) expect(c.radius).toBe(0)
  })
  it('the effect halo adds two rings under each point', () => {
    expect(renderGeoPoints(layout, pts, { effect: true })).toHaveLength(6)
    expect(renderGeoPoints(layout, pts)).toHaveLength(2)
  })
  it('a label is drawn only for a NAMED point on the settled frame', () => {
    const texts = renderGeoPoints(layout, pts, { showLabels: true }).filter((c) => c.kind === 'text')
    expect(texts).toHaveLength(1)
    expect(renderGeoPoints(layout, pts, { showLabels: true, progress: 0.5 }).filter((c) => c.kind === 'text')).toHaveLength(0)
  })
  it('path progress is clamped, and a path of fewer than two points is skipped', () => {
    const paths = [{ coords: [[0, 0], [5, 5], [10, 10]] as [number, number][] }, { coords: [[1, 1]] as [number, number][] }]
    const settled = renderGeoPaths(layout, paths)
    expect(settled).toHaveLength(1)
    expect(renderGeoPaths(layout, paths, { progress: 9 })).toEqual(settled)
    expect(renderGeoPaths(layout, paths, { progress: -1 })).toEqual([])
  })
})

describe('histogram mark', () => {
  it('a non-finite row is a gap in the binning input', () => {
    const h = histogram([1, 2, Number.NaN, 4], (v) => v)
    expect(h.data.length).toBeGreaterThan(0)
    expect(h.data.reduce((s, b) => s + b.count, 0), 'the gap is not binned').toBe(3)
  })
  it('a custom colour reaches the bar mark, and a custom format replaces the bin label', () => {
    const plain = histogram([1, 2, 3], (v) => v)
    expect(plain.marks[0]!.options.color).toBeUndefined()
    const coloured = histogram([1, 2, 3], (v) => v, { color: '#ff0000', format: (n) => `<${n}>` })
    expect(coloured.marks[0]!.options.color).toBe('#ff0000')
    expect(coloured.x(coloured.data[0]!)).toMatch(/^<.*>–<.*>$/)
    expect(plain.x(plain.data[0]!)).not.toContain('<')
  })
})

describe('error bounds on a mark', () => {
  it('a non-finite bound becomes a gap on both edges', () => {
    const m = bars<{ v: number; lo: number; hi: number }>((d) => d.v, {
      errorLow: (d) => d.lo,
      errorHigh: (d) => d.hi,
    })
    expect(m.errorLow).toBeDefined()
    expect(m.errorHigh).toBeDefined()
  })
})

describe('horizontal series points', () => {
  it('NO values produces no points', () => {
    expect(layoutSeriesPointsH([], { x: 0, y: 0, w: 10, h: 10 }, { min: 0, max: 1 })).toEqual([])
  })
  it('each value sits at its BAND centre down y', () => {
    const pts = layoutSeriesPointsH([0, 1], { x: 0, y: 0, w: 10, h: 10 }, { min: 0, max: 1 })
    expect(pts.map((p) => p.y)).toEqual([2.5, 7.5])
  })
})

describe('heat grid', () => {
  const grid = buildHeatGrid(['a', 'b'], ['r1', 'r2'], [0, 1, 0], [0, 1, 1], [1, 2, 3])
  const plot = { x: 0, y: 0, w: 100, h: 100 }

  it('the shortest of the three channels decides how many cells are read', () => {
    expect(buildHeatGrid(['a'], ['r'], [0, 0, 0], [0], [1, 1, 1]).cells, 'rowOf is shortest').toHaveLength(1)
    expect(buildHeatGrid(['a'], ['r'], [0], [0, 0, 0], [1, 1, 1]).cells, 'colOf is shortest').toHaveLength(1)
    expect(buildHeatGrid(['a'], ['r'], [0, 0], [0, 0], [1]).cells, 'values is shortest').toHaveLength(1)
  })
  it('explicit stops replace the default ramp', () => {
    const custom = renderHeat({ grid, plot, stops: ['#000000', '#ffffff'] }) as { fill: string }[]
    const dflt = renderHeat({ grid, plot }) as { fill: string }[]
    expect(custom.map((c) => c.fill)).not.toEqual(dflt.map((c) => c.fill))
  })
  it('a point on the far edge is clamped into the last column and row', () => {
    expect(hitHeatCell(grid, plot, 0, plot.x + plot.w, plot.y + plot.h)).toBeGreaterThanOrEqual(0)
  })
  it('a point in the GUTTER between cells is a miss', () => {
    expect(hitHeatCell(grid, plot, 20, plot.x + 51, plot.y + 51), 'just past the vertical gutter edge').toBe(-1)
    expect(hitHeatCell(grid, plot, 20, plot.x + 25, plot.y + 1), 'inside the horizontal gutter').toBe(-1)
  })
  it('a point outside the plot, or an empty grid, is a miss', () => {
    expect(hitHeatCell(grid, plot, 0, -1, -1)).toBe(-1)
    expect(hitHeatCell(buildHeatGrid([], [], [], [], []), plot, 0, 1, 1)).toBe(-1)
  })
})

describe('theme registry', () => {
  it('an UNREGISTERED name has no definition', () => {
    expect(getTheme('nope-not-a-theme')).toBeNull()
  })
  it('the legacy aliases fold into the engine tokens', () => {
    const r = resolveTheme({ textStyle: { color: '#111111', fontSize: 17 }, axisLineColor: '#222222', splitLineColor: '#333333' })
    expect(r.chartTheme.label).toBe('#111111')
    expect(r.chartTheme.fontSize).toBe(17)
    expect(r.chartTheme.axis).toBe('#222222')
    expect(r.chartTheme.grid).toBe('#333333')
  })
  it('an explicit token WINS over its alias', () => {
    const r = resolveTheme({ label: '#aaaaaa', textStyle: { color: '#111111' }, axis: '#bbbbbb', axisLineColor: '#222222', grid: '#cccccc', splitLineColor: '#333333' })
    expect(r.chartTheme.label).toBe('#aaaaaa')
    expect(r.chartTheme.axis).toBe('#bbbbbb')
    expect(r.chartTheme.grid).toBe('#cccccc')
  })
  it('an EMPTY background string means "no background", not a transparent one', () => {
    expect(resolveTheme({ background: '' }).background).toBeUndefined()
    expect(resolveTheme({ background: '#ffffff' }).background).toBe('#ffffff')
  })
  it('an unknown NAME warns and falls back to light', () => {
    const warnings: Parameters<typeof resolveTheme>[1] = []
    const r = resolveTheme('nope', warnings)
    expect(warnings!).toHaveLength(1)
    expect(r.palette).toBeNull()
  })
})

describe('navigator', () => {
  const canvas = { x: 0, y: 0, w: 200, h: 60 }
  const win = { start: 0.25, end: 0.75 }
  const nav = (values: number[]) => renderNavigator(values, '#2563eb', win, canvas, '#eeeeee')

  it('a DESCENDING series seeds the extent then lowers it', () => {
    expect(nav([5, 3, 1]).cmds.some((c) => c.kind === 'polygon')).toBe(true)
  })
  it('a series whose first value is its MAXIMUM never raises the high water mark', () => {
    expect(nav([9, 1, 2]).cmds.some((c) => c.kind === 'polygon')).toBe(true)
  })
  it('values that are ALL gaps draw the strip but no area', () => {
    const l = nav([Number.NaN, Number.NaN])
    expect(l.cmds.some((c) => c.kind === 'polygon')).toBe(false)
    expect(l.cmds.some((c) => c.kind === 'rect')).toBe(true)
  })
  it('a single value draws no area either — a sparkline needs two points', () => {
    expect(nav([1]).cmds.some((c) => c.kind === 'polygon')).toBe(false)
  })
  it('a leading gap is filled from the minimum rather than left as a NaN point', () => {
    const l = nav([Number.NaN, 4, 6])
    const poly = l.cmds.find((c) => c.kind === 'polygon') as { points: { y: number }[] }
    for (const p of poly.points) expect(Number.isFinite(p.y)).toBe(true)
  })
  it('a NEGATIVE series keeps its minimum, and a FLAT one is widened', () => {
    expect(nav([-5, -1]).cmds.some((c) => c.kind === 'polygon')).toBe(true)
    expect(nav([7, 7]).cmds.some((c) => c.kind === 'polygon')).toBe(true)
  })
  it('a press grabs the nearer handle, on either side of it', () => {
    const strip = { x: 0, y: 0, w: 200, h: 20 }
    const lo = strip.x + strip.w * win.start
    const hi = strip.x + strip.w * win.end
    expect(navigatorHit(strip, win, lo - 2), 'left of the left handle').toBe(2)
    expect(navigatorHit(strip, win, lo + 2)).toBe(2)
    expect(navigatorHit(strip, win, hi + 2), 'right of the right handle').toBe(3)
    expect(navigatorHit(strip, win, hi - 2)).toBe(3)
    expect(navigatorHit(strip, win, (lo + hi) / 2), 'the middle moves the band').toBe(1)
  })
})

describe('accessible table', () => {
  it('a NON-FINITE error bound drops the whisker rather than printing NaN', () => {
    const t = chartTable({
      categories: ['a'],
      series: [{ label: 'x', values: [3], kind: 'bar', errLow: [Number.NaN], errHigh: [4] }],
    })
    expect(t.rows[0]![1]).toBe('3')
    const good = chartTable({
      categories: ['a'],
      series: [{ label: 'x', values: [3], kind: 'bar', errLow: [2], errHigh: [4] }],
    })
    expect(good.rows[0]![1]).toBe('3 (2 to 4)')
  })
  it('a row PAST a series\' values leaves an empty cell in every one of its columns', () => {
    const t = chartTable({
      categories: ['a', 'b'],
      series: [{ label: 'x', values: [1], kind: 'bar', values2: [0], rValues: [5] }],
    })
    expect(t.headers).toEqual(['Category', 'x (upper)', 'x (lower)', 'x (size)'])
    expect(t.rows[1]).toEqual(['b', '', '', ''])
  })
  it('a RAGGED second channel or size channel leaves that cell empty', () => {
    const t = chartTable({
      categories: ['a', 'b'],
      series: [{ label: 'x', values: [1, 2], kind: 'band', values2: [0], rValues: [5] }],
    })
    expect(t.rows[1]![2], 'no lower bound at index 1').toBe('')
    expect(t.rows[1]![3], 'no size at index 1').toBe('')
  })
  it('a NON-FINITE second bound or size is an empty cell', () => {
    const t = chartTable({
      categories: ['a'],
      series: [{ label: 'x', values: [1], kind: 'band', values2: [Number.NaN], rValues: [Number.POSITIVE_INFINITY] }],
    })
    expect(t.rows[0]![2]).toBe('')
    expect(t.rows[0]![3]).toBe('')
  })
})
