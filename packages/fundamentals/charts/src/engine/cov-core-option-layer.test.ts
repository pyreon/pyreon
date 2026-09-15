// The dataset pre-pass and the graphic layer on their EDGE inputs: an
// unreadable source, a transform naming a dimension that does not exist, a
// derived dataset whose base is empty, a series whose column is past the end,
// and graphic shapes with every coordinate left out. Each spec pairs the edge
// with the ordinary input beside it.
import { describe, expect, it } from 'vitest'
import { appendGraphicLayer, applyTransforms, graphicCommands, readSource, resolveDataset, svgSize } from './option-layer'
import type { Table } from './option-layer'
import type { OptionWarning } from './option'

type Obj = Record<string, unknown>
const seriesOf = (o: Obj): Obj[] => o['series'] as Obj[]

describe('readSource — the shapes a dataset source can take', () => {
  it('answers null for a source that is missing, empty, or a plain list of scalars', () => {
    expect(readSource({})).toBeNull()
    expect(readSource({ source: [] })).toBeNull()
    expect(readSource({ source: 'nope' })).toBeNull()
    // Scalars are neither records nor rows — there is no dimension to read.
    expect(readSource({ source: [1, 2, 3] })).toBeNull()
    // The control: a row source reads.
    expect(readSource({ source: [[1, 2]] })!.rows).toEqual([[1, 2]])
  })

  it('declared `dimensions` may be names or {name} objects, and they WIN over the header row', () => {
    const t = readSource({ source: [['h1', 'h2'], [1, 2]], dimensions: ['a', { name: 'b' }] })!
    expect(t.dims).toEqual(['a', 'b'])
    // Declared dims do not consume the first row as a header …
    expect(t.rows).toEqual([[1, 2]])
    // … and a non-object, non-string entry is stringified rather than dropped.
    expect(readSource({ source: [[1]], dimensions: [7] })!.dims).toEqual(['7'])
  })

  it('an explicit sourceHeader overrides the auto-detection in both directions', () => {
    // Auto: a text first row over a numeric second row IS a header.
    expect(readSource({ source: [['a', 'b'], [1, 2]] })!.dims).toEqual(['a', 'b'])
    // Forced off: the same rows become data under generated dim names.
    const off = readSource({ sourceHeader: false, source: [['a', 'b'], [1, 2]] })!
    expect(off.dims).toEqual(['dim0', 'dim1'])
    expect(off.rows).toHaveLength(2)
    // Forced on (`1` is ECharts' truthy form) even when both rows are text.
    expect(readSource({ sourceHeader: 1, source: [['a', 'b'], ['x', 'y']] })!.rows).toEqual([['x', 'y']])
    // Auto declines when EVERY row is text — there is no numeric row to contrast.
    expect(readSource({ source: [['a', 'b'], ['x', 'y']] })!.dims).toEqual(['dim0', 'dim1'])
    // … and when there is only one row to begin with.
    expect(readSource({ source: [['a', 'b']] })!.rows).toEqual([['a', 'b']])
  })
})

describe('numeric reading — a numeric STRING counts, a non-finite one does not', () => {
  it('reads fromDatasetIndex and datasetIndex from a string, and ignores unreadable ones', () => {
    // A numeric string names the base dataset.
    const byString = resolveDataset({
      dataset: [{ source: [['n', 'v'], ['a', 1]] }, { fromDatasetIndex: '0', transform: { type: 'filter', config: { dimension: 'v', gt: 0 } } }],
      series: [{ type: 'bar', datasetIndex: '1' }],
    })
    expect(byString.warnings).toEqual([])
    expect(seriesOf(byString.option)[0]!['data']).toEqual([1])
    // A non-finite index is unreadable and falls back to dataset 0.
    const nonFinite = resolveDataset({
      dataset: [{ source: [['n', 'v'], ['a', 1]] }, { source: [['n', 'v'], ['b', 9]] }],
      series: [{ type: 'bar', datasetIndex: Number.NaN }],
    })
    expect(seriesOf(nonFinite.option)[0]!['data']).toEqual([1])
    // So is a blank string.
    const blank = resolveDataset({
      dataset: [{ source: [['n', 'v'], ['a', 1]] }, { source: [['n', 'v'], ['b', 9]] }],
      series: [{ type: 'bar', datasetIndex: '   ' }],
    })
    expect(seriesOf(blank.option)[0]!['data']).toEqual([1])
  })
})

describe('transforms — filter and sort over a table', () => {
  const t: Table = { dims: ['name', 'score'], rows: [['b', 2], ['a', 3], ['c', 1]] }

  it('a transform that is not an object is skipped, and an unknown type warns and passes through', () => {
    const w: OptionWarning[] = []
    expect(applyTransforms(t, ['nope', null, 7], w).rows).toEqual(t.rows)
    expect(w).toEqual([])
    const unknown: OptionWarning[] = []
    expect(applyTransforms(t, [{ type: 'ecStat:regression' }], unknown).rows).toEqual(t.rows)
    expect(unknown.map((x) => x.code)).toEqual(['option-key-unsupported'])
  })

  it('filter: every comparison operator and its symbol alias, over a numeric and a string dimension', () => {
    const rows = (cfg: Obj) => applyTransforms(t, [{ type: 'filter', config: cfg }], []).rows.map((r) => r[0])
    expect(rows({ dimension: 'score', gt: 1 })).toEqual(['b', 'a'])
    expect(rows({ dimension: 'score', '>': 2 })).toEqual(['a'])
    expect(rows({ dimension: 'score', gte: 2 })).toEqual(['b', 'a'])
    expect(rows({ dimension: 'score', lt: 2 })).toEqual(['c'])
    expect(rows({ dimension: 'score', lte: 2 })).toEqual(['b', 'c'])
    expect(rows({ dimension: 'score', eq: 3 })).toEqual(['a'])
    expect(rows({ dimension: 'score', ne: 3 })).toEqual(['b', 'c'])
    // A string dimension compares lexically, both directions.
    expect(rows({ dimension: 0, gt: 'a' })).toEqual(['b', 'c'])
    expect(rows({ dimension: 0, lt: 'b' })).toEqual(['a'])
    expect(rows({ dimension: 0, eq: 'a' })).toEqual(['a'])
    // and/or/not compose.
    expect(rows({ and: [{ dimension: 'score', gte: 2 }, { dimension: 0, eq: 'a' }] })).toEqual(['a'])
    expect(rows({ or: [{ dimension: 'score', lt: 2 }, { dimension: 0, eq: 'a' }] })).toEqual(['a', 'c'])
    expect(rows({ not: { dimension: 'score', gt: 1 } })).toEqual(['c'])
    // No config at all keeps every row.
    expect(applyTransforms(t, [{ type: 'filter' }], []).rows).toEqual(t.rows)
  })

  it('filter: a dimension the table does not have warns ONCE and keeps every row', () => {
    const w: OptionWarning[] = []
    const out = applyTransforms(t, [{ type: 'filter', config: { dimension: 'missing', gt: 0 } }], w)
    expect(out.rows).toEqual(t.rows)
    expect(w.map((x) => x.code)).toEqual(['series-data-shape'])
    // The warning is per PATH, not per row — three rows, one warning.
    expect(w).toHaveLength(1)
    // An out-of-range NUMERIC dimension is unknown in the same way.
    const numeric: OptionWarning[] = []
    applyTransforms(t, [{ type: 'filter', config: { dimension: 9, gt: 0 } }], numeric)
    expect(numeric).toHaveLength(1)
  })

  it('sort: ascending, descending, a stable tie, and a key naming a missing dimension', () => {
    const by = (cfg: unknown) => applyTransforms(t, [{ type: 'sort', config: cfg }], []).rows.map((r) => r[0])
    expect(by({ dimension: 'score' })).toEqual(['c', 'b', 'a'])
    expect(by({ dimension: 'score', order: 'desc' })).toEqual(['a', 'b', 'c'])
    // A bare (non-array) config is one key; an array is a key list.
    expect(by([{ dimension: 'score' }])).toEqual(['c', 'b', 'a'])
    // A missing key warns and is dropped; with no live key left the input order stands.
    const w: OptionWarning[] = []
    expect(applyTransforms(t, [{ type: 'sort', config: { dimension: 'nope' } }], w).rows.map((r) => r[0])).toEqual(['b', 'a', 'c'])
    expect(w.map((x) => x.code)).toEqual(['series-data-shape'])
    // A tie keeps the input order (the sort is stable by construction).
    const ties: Table = { dims: ['k', 'v'], rows: [['x', 1], ['y', 1]] }
    expect(applyTransforms(ties, [{ type: 'sort', config: { dimension: 'v' } }], []).rows.map((r) => r[0])).toEqual(['x', 'y'])
  })

  it('compares an absent cell as the empty string rather than crashing on it', () => {
    const holes: Table = { dims: ['k'], rows: [[null], ['b'], [undefined]] }
    const out = applyTransforms(holes, [{ type: 'sort', config: { dimension: 'k' } }], [])
    expect(out.rows.map((r) => r[0])).toEqual([null, undefined, 'b'])
  })
})

describe('resolveDataset — the series that cannot be materialised', () => {
  it('a derived dataset whose base has no readable source warns and stays empty', () => {
    const r = resolveDataset({
      dataset: [{ source: [] }, { fromDatasetIndex: 0, transform: { type: 'filter', config: {} } }],
      series: [{ type: 'bar', datasetIndex: 1 }],
    })
    expect(r.warnings.map((w) => w.path)).toContain('dataset[1].fromDatasetIndex')
    // The series is left as the caller wrote it — never silently blanked.
    expect(seriesOf(r.option)[0]!['data']).toBeUndefined()
  })

  it('a series pointing at a dataset index that does not exist warns by series path', () => {
    const r = resolveDataset({ dataset: { source: [['a', 1]] }, series: [{ type: 'bar', datasetIndex: 5 }] })
    expect(r.warnings.map((w) => w.path)).toEqual(['series[0].datasetIndex'])
    expect(seriesOf(r.option)[0]!['datasetIndex']).toBe(5)
  })

  it('`fromDatasetIndex` defaults to 0, so a lone transform chains off the first dataset', () => {
    const r = resolveDataset({
      dataset: [{ source: [['n', 'v'], ['a', 1], ['b', 5]] }, { transform: { type: 'filter', config: { dimension: 'v', gt: 2 } } }],
      series: [{ type: 'bar', datasetIndex: 1 }],
    })
    expect(r.warnings).toEqual([])
    expect(seriesOf(r.option)[0]!['data']).toEqual([5])
  })

  it('a series given as a bare OBJECT comes back as a bare object, not wrapped in an array', () => {
    const r = resolveDataset({ dataset: { source: [['n', 'v'], ['a', 3]] }, series: { type: 'bar' } })
    expect(Array.isArray(r.option['series'])).toBe(false)
    expect((r.option['series'] as Obj)['data']).toEqual([3])
    // An option with a dataset and NO series still resolves.
    expect(resolveDataset({ dataset: { source: [[1]] } }).warnings).toEqual([])
  })

  it('`encode` may name a dimension by index or in an array, and a pie may encode itemName', () => {
    const byIndex = resolveDataset({ dataset: { source: [['n', 'a', 'b'], ['x', 1, 9]] }, series: [{ type: 'bar', encode: { y: 2 } }] })
    expect(seriesOf(byIndex.option)[0]!['data']).toEqual([9])
    const byArray = resolveDataset({ dataset: { source: [['n', 'a', 'b'], ['x', 1, 9]] }, series: [{ type: 'bar', encode: { y: ['b'] } }] })
    expect(seriesOf(byArray.option)[0]!['data']).toEqual([9])
    const scatterEnc = resolveDataset({ dataset: { source: [['n', 'a', 'b'], ['x', 1, 9]] }, series: [{ type: 'scatter', encode: { x: 'a', y: 'b' } }] })
    expect(seriesOf(scatterEnc.option)[0]!['data']).toEqual([[1, 9]])
    const pie = resolveDataset({ dataset: { source: [['n', 'a', 'b'], ['x', 1, 9]] }, series: [{ type: 'pie', encode: { itemName: 'n', value: 'b' } }] })
    expect(seriesOf(pie.option)[0]!['data']).toEqual([{ name: 'x', value: 9 }])
    // A table with NO dimensions cannot supply either column, so the series
    // keeps its own shape rather than being filled with empties.
    const gone = resolveDataset({ dataset: { source: [[]] }, series: [{ type: 'pie' }] })
    expect(seriesOf(gone.option)[0]!['data']).toBeUndefined()
    // Same for a scatter, which needs two columns.
    const scatterGone = resolveDataset({ dataset: { source: [[]] }, series: [{ type: 'scatter' }] })
    expect(seriesOf(scatterGone.option)[0]!['data']).toBeUndefined()
  })

  it('a non-numeric cell becomes 0 for a pair channel and a GAP for a value channel', () => {
    const scatter = resolveDataset({ dataset: { sourceHeader: false, source: [['x', 'y']] }, series: [{ type: 'scatter' }] })
    expect(seriesOf(scatter.option)[0]!['data']).toEqual([[0, 0]])
    const bar = resolveDataset({ dataset: { source: [['n', 'v'], ['a', 1], ['b', 'nope']] }, series: [{ type: 'bar' }] })
    expect(seriesOf(bar.option)[0]!['data']).toEqual([1, null])
    const pie = resolveDataset({ dataset: { source: [['n', 'v'], [null, 'nope']] }, series: [{ type: 'pie' }] })
    expect(seriesOf(pie.option)[0]!['data']).toEqual([{ name: '', value: 0 }])
  })

  it('a series with no `type` still reads the value column', () => {
    const r = resolveDataset({ dataset: { source: [['n', 'v'], ['a', 4]] }, series: [{}] })
    expect(seriesOf(r.option)[0]!['data']).toEqual([4])
  })

  it('an xAxis GIVEN as an array keeps its extra entries when the categories are merged in', () => {
    const r = resolveDataset({
      dataset: { source: [['n', 'v'], ['a', 1], ['b', 2]] },
      xAxis: [{ type: 'category' }, { name: 'second' }],
      series: [{ type: 'bar' }],
    })
    const x = r.option['xAxis'] as Obj[]
    expect(Array.isArray(x)).toBe(true)
    expect(x[0]!['data']).toEqual(['a', 'b'])
    expect(x[1]).toEqual({ name: 'second' })
    // An xAxis that ALREADY has data is left alone.
    const kept = resolveDataset({ dataset: { source: [['n', 'v'], ['a', 1]] }, xAxis: { data: ['own'] }, series: [{ type: 'bar' }] })
    expect((kept.option['xAxis'] as Obj)['data']).toEqual(['own'])
  })

  it('`seriesLayoutBy: row` transposes, including a table whose rows are empty', () => {
    const r = resolveDataset({
      dataset: { sourceHeader: false, source: [['2023', 1, 2], ['2024', 3, 4]] },
      series: [{ type: 'bar', seriesLayoutBy: 'row' }],
    })
    expect(seriesOf(r.option)[0]!['data']).toEqual([1, 2])
    // A record source with no keys transposes to a table with no cells: an
    // EMPTY series rather than a crash or a warning about a missing dimension.
    const empty = resolveDataset({ dataset: { source: [{}] }, series: [{ type: 'bar', seriesLayoutBy: 'row' }] })
    expect(empty.warnings).toEqual([])
    expect(seriesOf(empty.option)[0]!['data']).toEqual([])
    // A table filtered down to NO rows still transposes: the width falls back
    // to zero rather than reading a row that is not there, and the series is
    // reported empty by name instead of crashing.
    const noRows = resolveDataset({
      dataset: [
        { source: [['h1', 'h2'], ['only', 1]] },
        { transform: { type: 'filter', config: { dimension: 'h2', gt: 99 } } },
      ],
      series: [{ type: 'bar', datasetIndex: 1, seriesLayoutBy: 'row' }],
    })
    expect(noRows.warnings.map((w) => w.path)).toEqual(['series[0]'])
    expect(seriesOf(noRows.option)[0]!['data']).toBeUndefined()
    // Rows WIDER than the declared dimensions still transpose — the columns
    // past the declared names get GENERATED names rather than `undefined`,
    // and each original column becomes one transposed record.
    const wide = resolveDataset({
      dataset: { source: [['a', 1, 2], ['b', 3, 4]], dimensions: ['only'] },
      series: [{ type: 'bar', seriesLayoutBy: 'row' }],
    })
    expect(seriesOf(wide.option)[0]!['data']).toEqual([1, 2])
  })
})

describe('graphic layer — shapes with their coordinates left out', () => {
  it('accepts `graphic` as an array, as {elements}, and as a single bare element', () => {
    const box = { type: 'rect', shape: { width: 4, height: 4 } }
    expect(graphicCommands({ graphic: [box] }, 100, 100).cmds).toHaveLength(1)
    expect(graphicCommands({ graphic: { elements: [box] } }, 100, 100).cmds).toHaveLength(1)
    expect(graphicCommands({ graphic: box }, 100, 100).cmds).toHaveLength(1)
    expect(graphicCommands({}, 100, 100).cmds).toEqual([])
    // A non-object entry is skipped rather than drawn.
    expect(graphicCommands({ graphic: ['nope', null, box] }, 100, 100).cmds).toHaveLength(1)
  })

  it('a circle takes its extent from `r`, and every missing coordinate defaults to 0', () => {
    const { cmds } = graphicCommands({
      graphic: [
        { type: 'circle', shape: { r: 5 }, right: 0 },
        { type: 'circle', shape: {} },
        { type: 'line', shape: {} },
        { type: 'rect', shape: {} },
      ],
    }, 100, 100)
    const c0 = cmds[0]!
    if (c0.kind !== 'circle') throw new Error('circle')
    // The circle's own width for the right-anchor is 2r, so its box ends at 100.
    expect(c0.center.x).toBeCloseTo(90, 9)
    const c1 = cmds[1]!
    if (c1.kind !== 'circle') throw new Error('circle')
    expect(c1.radius).toBe(0)
    expect(c1.center).toEqual({ x: 0, y: 0 })
    const l = cmds[2]!
    if (l.kind !== 'line') throw new Error('line')
    expect(l.from).toEqual({ x: 0, y: 0 })
    expect(l.to).toEqual({ x: 0, y: 0 })
    expect(l.width).toBe(1)
    const r = cmds[3]!
    if (r.kind !== 'rect') throw new Error('rect')
    expect(r.rect).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })

  it('a text element stringifies a non-string `text` and maps every textAlign', () => {
    const { cmds } = graphicCommands({
      graphic: [
        { type: 'text', style: { text: 42 } },
        { type: 'text', style: { text: 'r', textAlign: 'right' } },
        { type: 'text', style: { text: 'l', textAlign: 'left' } },
        { type: 'text', style: {} },
      ],
    }, 100, 100)
    const texts = cmds.filter((c) => c.kind === 'text')
    expect(texts.map((c) => (c.kind === 'text' ? c.text : ''))).toEqual(['42', 'r', 'l', ''])
    expect(texts.map((c) => (c.kind === 'text' ? c.align : ''))).toEqual(['start', 'end', 'start', 'start'])
    // The default size is honoured and an explicit one wins.
    expect(texts[0]!.kind === 'text' && texts[0]!.size).toBe(12)
  })

  it('a polygon needs two readable points; unreadable ones are dropped and a short run draws nothing', () => {
    const { cmds } = graphicCommands({
      graphic: [
        { type: 'polygon', shape: { points: [[0, 0], 'nope', [1, 'x'], [2, 2]] } },
        { type: 'polyline', shape: { points: [[0, 0]] } },
        { type: 'polyline', shape: {} },
      ],
    }, 100, 100)
    expect(cmds).toHaveLength(1)
    const pg = cmds[0]!
    if (pg.kind !== 'polygon') throw new Error('polygon')
    expect(pg.points).toEqual([{ x: 0, y: 0 }, { x: 2, y: 2 }])
  })

  it('a group with unreadable children contributes nothing, and offsets the ones it has', () => {
    const { cmds } = graphicCommands({
      graphic: [
        { type: 'group', left: 10, top: 20, children: 'nope' },
        { type: 'group', left: 10, top: 20, children: [{ type: 'rect', shape: { width: 1, height: 1 } }] },
      ],
    }, 100, 100)
    expect(cmds).toHaveLength(1)
    const r = cmds[0]!
    if (r.kind !== 'rect') throw new Error('rect')
    expect(r.rect.x).toBe(10)
    expect(r.rect.y).toBe(20)
  })

  it('placement: a numeric string is pixels, a percentage is a fraction, an unreadable one is absent', () => {
    const at = (e: Obj) => {
      const c = graphicCommands({ graphic: [{ type: 'rect', shape: { width: 2, height: 2 }, ...e }] }, 200, 100).cmds[0]!
      if (c.kind !== 'rect') throw new Error('rect')
      return c.rect
    }
    expect(at({ left: '50' }).x).toBe(50)
    expect(at({ left: '50%' }).x).toBe(100)
    expect(at({ left: 'center' }).x).toBe(99)
    expect(at({ left: 'middle' }).x).toBe(99)
    // Unreadable → falls back to the element's own x (0 here).
    expect(at({ left: 'nonsense' }).x).toBe(0)
    expect(at({ left: 'x%' }).x).toBe(0)
    expect(at({ x: 7 }).x).toBe(7)
    // `bottom` anchors from the far edge only when `top` is absent.
    expect(at({ bottom: 10 }).y).toBe(88)
    expect(at({ top: 5, bottom: 10 }).y).toBe(5)
  })
})

describe('splicing a layer into a rendered svg', () => {
  it('leaves the svg untouched when either document cannot be parsed', () => {
    const base = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>'
    // No commands: nothing to splice.
    expect(appendGraphicLayer(base, [], 10, 10)).toBe(base)
    // A target with no closing tag has nowhere to splice INTO.
    const broken = '<div>not an svg</div>'
    expect(appendGraphicLayer(broken, [{ kind: 'circle', center: { x: 1, y: 1 }, radius: 1, fill: '#abc' }], 10, 10)).toBe(broken)
    // The control: a real target takes the layer.
    expect(appendGraphicLayer(base, [{ kind: 'circle', center: { x: 1, y: 1 }, radius: 1, fill: '#abcdef' }], 10, 10)).toContain('#abcdef')
  })

  // NOTE: `appendGraphicLayer`'s guard on the freshly-RENDERED layer
  // (`open < 0 || close < 0`) is unreachable — `renderSvg` always emits a
  // complete `<svg …>…</svg>`, so both indices are always found. Only the
  // guard on the CALLER's svg (asserted above) can fire.

  it('svgSize answers null when either dimension is missing', () => {
    expect(svgSize('<svg width="300" height="200">')).toEqual({ width: 300, height: 200 })
    expect(svgSize('<svg width="300">')).toBeNull()
    expect(svgSize('<svg height="200">')).toBeNull()
    expect(svgSize('nope')).toBeNull()
  })
})
