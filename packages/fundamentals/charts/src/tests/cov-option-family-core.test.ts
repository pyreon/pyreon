import { describe, expect, it } from 'vitest'
import { compileFamily, isFamilyOption } from '../engine/option-family'
import type { EChartsOption } from '../engine/option'
import type { FamilyPlan } from '../engine/option-family'

/**
 * Branch coverage for the SHARED header of `compileFamily` (series unwrapping,
 * unknown-key warnings, title / legend / palette resolution) plus the pie,
 * gauge, radar, candlestick and cartesian-heatmap arms.
 *
 * Every spec pairs the input shape a branch acts on with the shape it must
 * leave alone — a one-sided assertion cannot tell a working branch from one
 * that fires unconditionally.
 */

/** The plan is a discriminated union; a spec knows which arm its option hits, so
 * the union is widened with an index signature to let each spec name the fields
 * it asserts on. The runtime assertions are the real check. */
type PlanFields = FamilyPlan & { [k: string]: unknown }
const plan = (o: EChartsOption): PlanFields => compileFamily(o)!.plan as PlanFields
const warns = (o: EChartsOption): string[] => compileFamily(o)!.warnings.map((w) => w.path)
const pie = (extra: Record<string, unknown> = {}, top: Record<string, unknown> = {}): EChartsOption => ({
  series: [{ type: 'pie', data: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }], ...extra }],
  ...top,
})

describe('isFamilyOption routes only the non-cartesian first series', () => {
  it('accepts every family type and rejects a cartesian one', () => {
    for (const t of ['pie', 'gauge', 'radar', 'candlestick', 'heatmap', 'funnel', 'treemap', 'sunburst', 'tree', 'sankey', 'graph', 'parallel', 'themeRiver', 'boxplot', 'map', 'chord']) {
      expect(isFamilyOption({ series: [{ type: t }] })).toBe(true)
    }
    expect(isFamilyOption({ series: [{ type: 'bar', data: [1] }] })).toBe(false)
    expect(isFamilyOption({ series: [{ type: 'line' }] })).toBe(false)
    // compileFamily declines the cartesian ones outright — compileOption owns them.
    expect(compileFamily({ series: [{ type: 'bar', data: [1] }] })).toBeNull()
  })
  it('a coordinateSystem promotes an otherwise-cartesian type into a family', () => {
    expect(isFamilyOption({ series: [{ type: 'bar', coordinateSystem: 'polar' }] })).toBe(true)
    expect(isFamilyOption({ series: [{ type: 'scatter', coordinateSystem: 'geo' }] })).toBe(true)
    expect(isFamilyOption({ series: [{ type: 'scatter', coordinateSystem: 'singleAxis' }] })).toBe(true)
    // An unknown coordinateSystem is not a family.
    expect(isFamilyOption({ series: [{ type: 'bar', coordinateSystem: 'cartesian2d' }] })).toBe(false)
  })
  it('a missing, non-object or type-less series is not a family', () => {
    expect(isFamilyOption({})).toBe(false)
    expect(isFamilyOption({ series: [] })).toBe(false)
    expect(isFamilyOption({ series: ['pie'] })).toBe(false)
    expect(isFamilyOption({ series: [{ data: [1] }] })).toBe(false)
    expect(isFamilyOption({ series: [{ type: 42 }] })).toBe(false)
  })
})

describe('compileFamily header', () => {
  it('unwraps a bare (non-array) series object exactly like a one-element array', () => {
    const asArray = plan(pie())
    const asObject = plan({ series: { type: 'pie', data: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }] } })
    expect(asObject).toEqual(asArray)
  })
  it('warns once per UNKNOWN top-level key and stays silent on the known ones', () => {
    expect(warns(pie({}, { legend: {}, tooltip: {}, color: ['#111'], animation: false, grid: {} }))).toEqual([])
    const w = compileFamily(pie({}, { dataZoom: {}, toolbox: {} }))!.warnings
    expect(w.map((x) => x.path)).toEqual(['dataZoom', 'toolbox'])
    expect(w[0]!.code).toBe('option-key-unsupported')
    expect(w[0]!.message).toContain('"dataZoom"')
  })
  it('warns per UNKNOWN series key, by family — a gauge key on a pie is unknown', () => {
    expect(warns(pie({ radius: '60%', label: {}, itemStyle: {}, center: ['50%', '50%'] }))).toEqual([])
    // `min`/`max` are gauge keys; on a pie they have no mapping.
    const w = compileFamily(pie({ min: 0, max: 10 }))!.warnings
    expect(w.map((x) => x.path)).toEqual(['series[0].min', 'series[0].max'])
    expect(w[0]!.message).toContain('for pie')
    // …and the same keys ARE known on a gauge.
    expect(warns({ series: [{ type: 'gauge', data: [{ value: 5 }], min: 0, max: 10 }] })).toEqual([])
  })
  it('warns that only the first series renders — except for the multi-series families', () => {
    expect(warns({ series: [{ type: 'pie', data: [] }, { type: 'pie', data: [] }] })).toEqual(['series[1]'])
    // One series never warns.
    expect(warns(pie())).toEqual([])
    // radar / polar / boxplot / geo / singleAxis legitimately render more than one.
    expect(warns({ radar: { indicator: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }, series: [{ type: 'radar', data: [] }, { type: 'radar', data: [] }] })).toEqual([])
    expect(warns({ singleAxis: {}, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [] }, { type: 'scatter', coordinateSystem: 'singleAxis', data: [] }] })).toEqual([])
    expect(warns({ series: [{ type: 'boxplot', data: [] }, { type: 'scatter', data: [] }] })).toEqual([])
  })
  it('reads the title from `title.text`, accepts the array form, and leaves every other shape undefined', () => {
    expect(plan(pie({}, { title: { text: 'Sales' } })).title).toBe('Sales')
    expect(plan(pie({}, { title: [{ text: 'First' }, { text: 'Second' }] })).title).toBe('First')
    expect(plan(pie({}, { title: { subtext: 'only a subtitle' } })).title).toBeUndefined()
    expect(plan(pie({}, { title: { text: 42 } })).title).toBeUndefined()
    expect(plan(pie({}, { title: 'Sales' })).title).toBeUndefined()
    expect(plan(pie()).title).toBeUndefined()
  })
  it('shows the legend when the key is PRESENT unless it says show:false', () => {
    const showLegend = (top: Record<string, unknown>): boolean => (plan(pie({}, top)) as { showLegend: boolean }).showLegend
    expect(showLegend({})).toBe(false)
    expect(showLegend({ legend: {} })).toBe(true)
    expect(showLegend({ legend: { show: true } })).toBe(true)
    expect(showLegend({ legend: { show: false } })).toBe(false)
    // A non-object legend is still "present".
    expect(showLegend({ legend: true })).toBe(true)
  })
  it('uses option.color as the palette, dropping non-string entries, and falls back when absent', () => {
    const colors = (top: Record<string, unknown>): (string | undefined)[] => (plan(pie({}, top)) as { rows: { color: string | undefined }[] }).rows.map((r) => r.color)
    expect(colors({ color: ['#111', '#222'] })).toEqual(['#111', '#222'])
    // Non-strings are filtered out, so the second slice wraps back onto '#111'.
    expect(colors({ color: ['#111', 7, null] })).toEqual(['#111', '#111'])
    // No palette at all → no per-row colour (the renderer's default palette applies).
    expect(colors({})).toEqual([undefined, undefined])
    expect(colors({ color: 'not-an-array' })).toEqual([undefined, undefined])
  })
  it('a non-array series.data warns and is treated as empty', () => {
    const c = compileFamily({ series: [{ type: 'pie', data: { a: 1 } }] })!
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data'])
    expect(c.warnings[0]!.code).toBe('series-data-shape')
    expect((c.plan as unknown as { rows: unknown[] }).rows).toEqual([])
    // An array — even an empty one — does not warn.
    expect(warns({ series: [{ type: 'pie', data: [] }] })).toEqual([])
  })
})

describe('pie', () => {
  it('reads a bare number, an object value, and skips a datum with no number', () => {
    const c = compileFamily({ series: [{ type: 'pie', data: [3, { value: 4 }, { value: 'nope' }, null, { name: 'x' }] }] })!
    expect((c.plan as unknown as { rows: { value: number; name: string }[] }).rows).toEqual([
      { value: 3, name: 'Slice 1', color: undefined },
      { value: 4, name: 'Slice 2', color: undefined },
    ])
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[2]', 'series[0].data[3]', 'series[0].data[4]'])
    expect(c.warnings[0]!.message).toContain('numeric value')
  })
  it('numeric strings parse; a blank or unparseable string does not', () => {
    const rows = (data: unknown[]): unknown[] => (plan({ series: [{ type: 'pie', data }] }) as { rows: unknown[] }).rows
    expect(rows(['12', ' 3.5 '])).toHaveLength(2)
    expect(rows(['', '   ', 'abc', Number.NaN, Number.POSITIVE_INFINITY])).toEqual([])
  })
  it('names a datum from `name`, falling back to a 1-based slice label', () => {
    const rows = (plan({ series: [{ type: 'pie', data: [{ value: 1, name: 'Cats' }, { value: 2 }, { value: 3, name: 9 }] }] }) as { rows: { name: string }[] }).rows
    expect(rows.map((r) => r.name)).toEqual(['Cats', 'Slice 2', 'Slice 3'])
  })
  it('a per-datum itemStyle.color beats the palette; a non-string one does not', () => {
    const rows = (plan({ color: ['#p0', '#p1'], series: [{ type: 'pie', data: [{ value: 1, itemStyle: { color: '#own' } }, { value: 2, itemStyle: { color: 5 } }, { value: 3, itemStyle: 'x' }] }] }) as { rows: { color: string | undefined }[] }).rows
    // The palette is indexed by the DATUM index, so slice 3 wraps back to '#p0'.
    expect(rows.map((r) => r.color)).toEqual(['#own', '#p1', '#p0'])
  })
  it('radius [inner, outer] becomes the hole ratio; every other shape keeps a full pie', () => {
    const inner = (radius: unknown): number => (plan(pie({ radius })) as { innerRadius: number }).innerRadius
    expect(inner(['40%', '80%'])).toBeCloseTo(0.5, 9)
    expect(inner([40, 80])).toBeCloseTo(0.5, 9)
    // Clamped into [0, 0.95].
    expect(inner(['90%', '80%'])).toBe(0.95)
    expect(inner(['-10%', '80%'])).toBe(0)
    // A single value, a wrong-length array, a zero outer, and a junk entry all mean "no hole".
    expect(inner('60%')).toBe(0)
    expect(inner(['40%'])).toBe(0)
    expect(inner(['0%', '0%'])).toBe(0)
    expect(inner(['x', '80%'])).toBe(0)
    expect(inner(undefined)).toBe(0)
  })
  it('labels show unless label.show is exactly false', () => {
    const showLabels = (label: unknown): boolean => (plan(pie({ label })) as { showLabels: boolean }).showLabels
    expect(showLabels(undefined)).toBe(true)
    expect(showLabels({})).toBe(true)
    expect(showLabels({ show: true })).toBe(true)
    expect(showLabels({ show: false })).toBe(false)
    // A non-object label cannot turn labels off.
    expect(showLabels('no')).toBe(true)
  })
})

describe('gauge', () => {
  it('takes the first datum, a bare number or an object, and defaults the domain', () => {
    expect(plan({ series: [{ type: 'gauge', data: [{ value: 42 }] }] })).toMatchObject({ kind: 'gauge', value: 42, min: 0, max: 100 })
    expect(plan({ series: [{ type: 'gauge', data: [7] }] })).toMatchObject({ value: 7 })
    expect(plan({ series: [{ type: 'gauge', data: [{ value: 5 }], min: -10, max: '50' }] })).toMatchObject({ min: -10, max: 50 })
    // A non-numeric min/max falls back to the default rather than NaN.
    expect(plan({ series: [{ type: 'gauge', data: [{ value: 5 }], min: 'x', max: null }] })).toMatchObject({ min: 0, max: 100 })
  })
  it('a missing value marks the plan unsupported and renders zero', () => {
    const c = compileFamily({ series: [{ type: 'gauge', data: [] }] })!
    expect(c.supported).toBe(false)
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[0]'])
    expect((c.plan as unknown as { value: number }).value).toBe(0)
    expect(compileFamily({ series: [{ type: 'gauge', data: [{ value: 'x' }] }] })!.supported).toBe(false)
    // A real value is supported.
    expect(compileFamily({ series: [{ type: 'gauge', data: [1] }] })!.supported).toBe(true)
  })
  it('detail.show gates the readout; a non-object detail cannot', () => {
    const showValue = (detail: unknown): boolean => (plan({ series: [{ type: 'gauge', data: [1], detail }] }) as { showValue: boolean }).showValue
    expect(showValue(undefined)).toBe(true)
    expect(showValue({ show: false })).toBe(false)
    expect(showValue({ show: true })).toBe(true)
    expect(showValue(false)).toBe(true)
  })
  it('thickness comes from axisLine.lineStyle.width, and only from the full nesting', () => {
    const thickness = (axisLine: unknown): number | undefined => (plan({ series: [{ type: 'gauge', data: [1], axisLine }] }) as { thickness: number | undefined }).thickness
    expect(thickness({ lineStyle: { width: 18 } })).toBe(18)
    expect(thickness({ lineStyle: {} })).toBeUndefined()
    expect(thickness({ lineStyle: 'thick' })).toBeUndefined()
    expect(thickness({})).toBeUndefined()
    expect(thickness(undefined)).toBeUndefined()
  })
  it('valueColor prefers progress.itemStyle.color, then series itemStyle.color', () => {
    const color = (s: Record<string, unknown>): string | undefined => (plan({ series: [{ type: 'gauge', data: [1], ...s }] }) as { valueColor: string | undefined }).valueColor
    expect(color({ progress: { itemStyle: { color: '#prog' } }, itemStyle: { color: '#item' } })).toBe('#prog')
    expect(color({ itemStyle: { color: '#item' } })).toBe('#item')
    expect(color({ progress: { itemStyle: {} }, itemStyle: { color: '#item' } })).toBe('#item')
    expect(color({ progress: { itemStyle: { color: 3 } } })).toBeUndefined()
    expect(color({ progress: {}, itemStyle: 'x' })).toBeUndefined()
    expect(color({})).toBeUndefined()
  })
})

describe('radar', () => {
  const indicator = [{ name: 'a', max: 10 }, { name: 'b', max: 10 }, { name: 'c', max: 10 }]
  it('reads the indicators, names an unnamed one and defaults max to 100', () => {
    const p = plan({ radar: { indicator: [{ name: 'Speed', max: 20 }, {}, { name: 5 }] }, series: [{ type: 'radar', data: [] }] }) as { axes: { label: string; max: number }[] }
    expect(p.axes).toEqual([{ label: 'Speed', max: 20 }, { label: 'Axis 2', max: 100 }, { label: 'Axis 3', max: 100 }])
  })
  it('skips a non-object indicator, and fewer than three axes is unsupported', () => {
    const c = compileFamily({ radar: { indicator: [{ name: 'a' }, 'b', null, { name: 'c' }] }, series: [{ type: 'radar', data: [] }] })!
    expect((c.plan as unknown as { axes: { label: string }[] }).axes.map((a) => a.label)).toEqual(['a', 'c'])
    expect(c.supported).toBe(false)
    expect(c.warnings.map((w) => w.path)).toContain('radar.indicator')
    expect(compileFamily({ radar: { indicator }, series: [{ type: 'radar', data: [] }] })!.supported).toBe(true)
  })
  it('accepts the array form of `radar` and tolerates a missing / non-array indicator', () => {
    expect((plan({ radar: [{ indicator }], series: [{ type: 'radar', data: [] }] }) as { axes: unknown[] }).axes).toHaveLength(3)
    expect((plan({ radar: {}, series: [{ type: 'radar', data: [] }] }) as { axes: unknown[] }).axes).toEqual([])
    expect((plan({ series: [{ type: 'radar', data: [] }] }) as { axes: unknown[] }).axes).toEqual([])
    expect((plan({ radar: 'nope', series: [{ type: 'radar', data: [] }] }) as { axes: unknown[] }).axes).toEqual([])
  })
  it('reads rows across EVERY radar series and ignores a non-radar sibling', () => {
    const p = plan({
      radar: { indicator },
      series: [
        { type: 'radar', data: [{ value: [1, 2, 3], name: 'First' }] },
        { type: 'radar', data: [[4, 5, 6]] },
        { type: 'bar', data: [[7, 8, 9]] },
        'junk',
      ],
    }) as { rows: { values: number[]; name: string }[] }
    expect(p.rows).toEqual([
      { values: [1, 2, 3], name: 'First', color: undefined },
      { values: [4, 5, 6], name: 'Series 2', color: undefined },
    ])
  })
  it('skips a datum with no value array, naming the series index in the path', () => {
    const c = compileFamily({ radar: { indicator }, series: [{ type: 'radar', data: [] }, { type: 'radar', data: [{ value: 'x' }, 7] }] })!
    expect(c.warnings.map((w) => w.path)).toEqual(['series[1].data[0]', 'series[1].data[1]'])
    // A non-numeric member of a real value array becomes 0 rather than skipping the row.
    expect((plan({ radar: { indicator }, series: [{ type: 'radar', data: [['x', 2, null]] }] }) as { rows: { values: number[] }[] }).rows[0]!.values).toEqual([0, 2, 0])
  })
  it('areaStyle drives fillAlpha: absent keeps the default, present-without-opacity too, a number wins', () => {
    const alpha = (areaStyle: unknown): number => (plan({ radar: { indicator }, series: [{ type: 'radar', data: [[1, 2, 3]], areaStyle }] }) as { fillAlpha: number }).fillAlpha
    expect(alpha(undefined)).toBeCloseTo(0.25, 9)
    expect(alpha({})).toBeCloseTo(0.25, 9)
    expect(alpha({ opacity: 0.6 })).toBeCloseTo(0.6, 9)
    expect(alpha({ opacity: 'x' })).toBeCloseTo(0.25, 9)
    // A non-object areaStyle is "present but empty", not a crash.
    expect(alpha('yes')).toBeCloseTo(0.25, 9)
  })
  it('a per-row itemStyle.color beats the palette, which cycles by row', () => {
    const rows = (plan({ color: ['#p0', '#p1'], radar: { indicator }, series: [{ type: 'radar', data: [[1, 2, 3], { value: [1, 1, 1], itemStyle: { color: '#own' } }, [2, 2, 2]] }] }) as { rows: { color: string | undefined }[] }).rows
    expect(rows.map((r) => r.color)).toEqual(['#p0', '#own', '#p0'])
  })
})

describe('candlestick', () => {
  it('maps [open, close, low, high] onto the x categories, falling back to a 1-based label', () => {
    const p = plan({ xAxis: { data: ['Mon', 7] }, series: [{ type: 'candlestick', data: [[1, 2, 0, 3], { value: [4, 5, 3, 6] }, [7, 8, 6, 9]] }] }) as { rows: { x: string; open: number; close: number; low: number; high: number }[] }
    expect(p.rows).toEqual([
      { x: 'Mon', open: 1, close: 2, low: 0, high: 3 },
      { x: '7', open: 4, close: 5, low: 3, high: 6 },
      { x: '3', open: 7, close: 8, low: 6, high: 9 },
    ])
  })
  it('skips a datum that is not an array of at least four, and tolerates a missing axis', () => {
    const c = compileFamily({ series: [{ type: 'candlestick', data: [[1, 2, 3], 'x', { value: 5 }, [1, 2, 3, 4]] }] })!
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[0]', 'series[0].data[1]', 'series[0].data[2]'])
    expect((c.plan as unknown as { rows: { x: string }[] }).rows).toEqual([{ x: '4', open: 1, close: 2, low: 3, high: 4 }])
    // A non-object xAxis, and one without data, both leave the categories empty.
    expect((plan({ xAxis: 'x', series: [{ type: 'candlestick', data: [[1, 2, 3, 4]] }] }) as { rows: { x: string }[] }).rows[0]!.x).toBe('1')
    expect((plan({ xAxis: {}, series: [{ type: 'candlestick', data: [[1, 2, 3, 4]] }] }) as { rows: { x: string }[] }).rows[0]!.x).toBe('1')
  })
  it('a non-numeric member becomes 0 rather than dropping the candle', () => {
    expect((plan({ series: [{ type: 'candlestick', data: [['a', null, {}, 4]] }] }) as { rows: unknown[] }).rows).toEqual([{ x: '1', open: 0, close: 0, low: 0, high: 4 }])
  })
  it('itemStyle.color / color0 become the up / down colours, and only strings do', () => {
    const p = (itemStyle: unknown): { upColor?: string; downColor?: string } => plan({ series: [{ type: 'candlestick', data: [], itemStyle }] }) as { upColor?: string; downColor?: string }
    expect(p({ color: '#up', color0: '#down' })).toMatchObject({ upColor: '#up', downColor: '#down' })
    expect(p({ color: 1, color0: null })).toMatchObject({ upColor: undefined, downColor: undefined })
    expect(p('x')).toMatchObject({ upColor: undefined, downColor: undefined })
    expect(p(undefined)).toMatchObject({ upColor: undefined, downColor: undefined })
  })
})

describe('heatmap (cartesian — the fall-through arm)', () => {
  it('resolves [xIndex, yIndex, value] against the axis categories', () => {
    const p = plan({ xAxis: { data: ['Mon', 'Tue'] }, yAxis: { data: ['AM', 'PM'] }, series: [{ type: 'heatmap', data: [[0, 0, 5], { value: [1, 1, 9] }] }] }) as { rows: { x: string; y: string; value: number }[] }
    expect(p.rows).toEqual([{ x: 'Mon', y: 'AM', value: 5 }, { x: 'Tue', y: 'PM', value: 9 }])
  })
  it('an index with no category, and a non-numeric index, fall back to the raw value stringified', () => {
    const p = plan({ xAxis: { data: ['Mon'] }, yAxis: { data: ['AM'] }, series: [{ type: 'heatmap', data: [[9, 9, 1], ['Wed', 'PM', 2]] }] }) as { rows: { x: string; y: string }[] }
    expect(p.rows).toEqual([{ x: '9', y: '9', value: 1 }, { x: 'Wed', y: 'PM', value: 2 }])
    // No axes at all: everything falls back.
    expect((plan({ series: [{ type: 'heatmap', data: [[0, 1, 3]] }] }) as { rows: { x: string; y: string }[] }).rows).toEqual([{ x: '0', y: '1', value: 3 }])
    // A non-object axis is the same as no axis.
    expect((plan({ xAxis: 7, yAxis: 7, series: [{ type: 'heatmap', data: [[0, 1, 3]] }] }) as { rows: { x: string }[] }).rows[0]!.x).toBe('0')
  })
  it('skips a datum shorter than three, and defaults a non-numeric value to 0', () => {
    const c = compileFamily({ series: [{ type: 'heatmap', data: [[0, 1], 'x', { value: [0, 1] }, [0, 1, 'v']] }] })!
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[0]', 'series[0].data[1]', 'series[0].data[2]'])
    expect((c.plan as unknown as { rows: { value: number }[] }).rows).toEqual([{ x: '0', y: '1', value: 0 }])
  })
  it('visualMap.inRange.color becomes the ramp, and only through the full nesting', () => {
    const colors = (visualMap: unknown): string[] | undefined => (plan({ visualMap, series: [{ type: 'heatmap', data: [] }] }) as { colors: string[] | undefined }).colors
    expect(colors({ inRange: { color: ['#a', '#b', 3] } })).toEqual(['#a', '#b'])
    expect(colors([{ inRange: { color: ['#a'] } }])).toEqual(['#a'])
    expect(colors({ inRange: {} })).toBeUndefined()
    expect(colors({ inRange: 'x' })).toBeUndefined()
    expect(colors({})).toBeUndefined()
    expect(colors(undefined)).toBeUndefined()
  })
})
