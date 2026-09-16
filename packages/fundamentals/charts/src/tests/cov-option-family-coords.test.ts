import { describe, expect, it } from 'vitest'
import { compileFamily } from '../engine/option-family'
import type { FamilyPlan } from '../engine/option-family'
import type { EChartsOption } from '../engine/option'
import { registerMap } from '../engine/geo-web'
import type { GeoJson } from '../engine/geo-web'

/**
 * Branch coverage for the COORDINATE-SYSTEM family arms of `compileFamily`:
 * singleAxis, geo, map, polar, parallel, calendar-heatmap, themeRiver and
 * boxplot. Each spec pairs the shape a branch acts on with the shape it must
 * leave alone.
 */

/** The plan is a discriminated union; a spec knows which arm its option hits, so
 * the union is widened with an index signature to let each spec name the fields
 * it asserts on. The runtime assertions are the real check. */
type PlanFields = FamilyPlan & { [k: string]: unknown }
const plan = (o: EChartsOption): PlanFields => compileFamily(o)!.plan as PlanFields
const warns = (o: EChartsOption): string[] => compileFamily(o)!.warnings.map((w) => w.path)
const series = (s: Record<string, unknown>, top: Record<string, unknown> = {}): EChartsOption => ({ series: [s], ...top })

// A two-square world registered under a name only this file uses.
const world: GeoJson = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'West' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'East' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
  ],
}
registerMap('cov-family-world', world)

describe('singleAxis', () => {
  const sa = (s: Record<string, unknown>, singleAxis?: unknown): PlanFields => plan(series({ type: 'scatter', coordinateSystem: 'singleAxis', ...s }, singleAxis === undefined ? {} : { singleAxis }))
  it('a value axis reads min/max as a domain; a category axis reads the labels instead', () => {
    expect((sa({ data: [] }, { min: 0, max: 10, name: 'Load' }) as { axis: unknown }).axis).toEqual({ type: 'value', domain: { min: 0, max: 10 }, name: 'Load' })
    expect((sa({ data: [] }, { type: 'category', data: ['a', { value: 'b' }, 7] }) as { axis: unknown }).axis).toEqual({ type: 'category', categories: ['a', 'b', '7'] })
    // A category axis with no data still gets an (empty) category list, never a domain.
    expect((sa({ data: [] }, { type: 'category', min: 0, max: 5 }) as { axis: unknown }).axis).toEqual({ type: 'category', categories: [] })
    // A half-specified value domain is dropped rather than half-applied.
    expect((sa({ data: [] }, { min: 0 }) as { axis: unknown }).axis).toEqual({ type: 'value' })
    // No singleAxis at all, and a non-object one, both mean a bare value axis.
    expect((sa({ data: [] }) as { axis: unknown }).axis).toEqual({ type: 'value' })
    expect((sa({ data: [] }, 'x') as { axis: unknown }).axis).toEqual({ type: 'value' })
    // The array form takes the first entry.
    expect((sa({ data: [] }, [{ name: 'First' }, { name: 'Second' }]) as { axis: { name?: string } }).axis.name).toBe('First')
  })
  it('a datum may be a scalar, a [position, size] pair, or an object with either', () => {
    const points = (data: unknown[]): unknown[] => (sa({ data }) as { points: unknown[] }).points
    expect(points([3, [5, 20], { value: 7 }, { value: [9, 4], name: 'Nine', itemStyle: { color: '#c' } }])).toEqual([
      { x: 3 },
      { x: 5, size: 20 },
      { x: 7 },
      { x: 9, size: 4, name: 'Nine', color: '#c' },
    ])
  })
  it('a datum with no numeric position is skipped by name', () => {
    const c = compileFamily(series({ type: 'scatter', coordinateSystem: 'singleAxis', data: [1, 'x', {}, [null]] }))!
    expect((c.plan as unknown as { points: unknown[] }).points).toEqual([{ x: 1 }])
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[1]', 'series[0].data[2]', 'series[0].data[3]'])
  })
  it('effectScatter is accepted; any other series type warns and draws no points', () => {
    expect(warns(series({ type: 'effectScatter', coordinateSystem: 'singleAxis', data: [1] }))).toEqual([])
    const c = compileFamily(series({ type: 'line', coordinateSystem: 'singleAxis', data: [1, 2] }))!
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].type'])
    expect(c.warnings[0]!.code).toBe('series-type-unsupported')
    expect((c.plan as unknown as { points: unknown[] }).points).toEqual([])
  })
  it('labels are OFF unless label.show is true; symbolSize halves into a radius', () => {
    const opts = (s: Record<string, unknown>): Record<string, unknown> => (sa({ data: [], ...s }) as unknown as { options: Record<string, unknown> }).options
    expect(opts({})).toEqual({ showLabels: false })
    expect(opts({ label: { show: true } })).toEqual({ showLabels: true })
    expect(opts({ label: { show: false } })).toEqual({ showLabels: false })
    expect(opts({ symbolSize: 12, itemStyle: { color: '#c' } })).toEqual({ showLabels: false, radius: 6, color: '#c' })
    expect(opts({ symbolSize: 'x', itemStyle: 'x' })).toEqual({ showLabels: false })
  })
})

describe('geo (scatter / lines on a geo coordinate)', () => {
  const geo = (s: Record<string, unknown>, top: Record<string, unknown> = {}): PlanFields => plan(series({ coordinateSystem: 'geo', ...s }, { geo: { map: 'cov-family-world' }, ...top }))
  it('resolves the registered map, and warns when the name is missing or unregistered', () => {
    expect((geo({ type: 'scatter', data: [] }) as { geo: GeoJson }).geo.features).toHaveLength(2)
    const c = compileFamily(series({ type: 'scatter', coordinateSystem: 'geo', data: [] }, { geo: { map: 'nope' } }))!
    expect(c.warnings.map((w) => w.path)).toEqual(['geo.map'])
    expect(c.warnings[0]!.message).toContain('registerMap')
    expect((c.plan as unknown as { geo: GeoJson }).geo.features).toEqual([])
    // No geo block at all, and a non-object one, both resolve the empty map name.
    expect(warns(series({ type: 'scatter', coordinateSystem: 'geo', data: [] }))).toEqual(['geo.map'])
    expect(warns(series({ type: 'scatter', coordinateSystem: 'geo', data: [] }, { geo: 'x' }))).toEqual(['geo.map'])
    // The array form takes the first geo.
    expect((plan(series({ type: 'scatter', coordinateSystem: 'geo', data: [] }, { geo: [{ map: 'cov-family-world' }] })) as { geo: GeoJson }).geo.features).toHaveLength(2)
  })
  it('geo.itemStyle borderColor / areaColor become the map styling, and only strings do', () => {
    expect((geo({ type: 'scatter', data: [] }, { geo: { map: 'cov-family-world', itemStyle: { borderColor: '#b', areaColor: '#a' } } }) as { map: unknown }).map).toEqual({ borderColor: '#b', emptyColor: '#a' })
    expect((geo({ type: 'scatter', data: [] }, { geo: { map: 'cov-family-world', itemStyle: { borderColor: 1, areaColor: null } } }) as { map: unknown }).map).toEqual({})
    expect((geo({ type: 'scatter', data: [] }, { geo: { map: 'cov-family-world', itemStyle: 'x' } }) as { map: unknown }).map).toEqual({})
  })
  it('a scatter datum is [lon, lat, value?] in array or object form', () => {
    const points = (geo({ type: 'scatter', data: [[1, 2], [3, 4, 5], { value: [6, 7, 8], name: 'Here', itemStyle: { color: '#c' } }] }) as { points: unknown[] }).points
    expect(points).toEqual([{ lon: 1, lat: 2 }, { lon: 3, lat: 4, value: 5 }, { lon: 6, lat: 7, value: 8, name: 'Here', color: '#c' }])
  })
  it('a scatter datum without both coordinates is skipped by name', () => {
    const c = compileFamily(series({ type: 'scatter', coordinateSystem: 'geo', data: [[1, 2], [1], ['x', 2], 'nope', { value: 5 }] }, { geo: { map: 'cov-family-world' } }))!
    expect((c.plan as unknown as { points: unknown[] }).points).toEqual([{ lon: 1, lat: 2 }])
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[1]', 'series[0].data[2]', 'series[0].data[3]', 'series[0].data[4]'])
  })
  it('lines build paths from coords, keeping only well-formed [lon, lat] pairs', () => {
    const paths = (geo({ type: 'lines', data: [[[0, 0], [1, 1]], { coords: [[2, 2], [3, 3], ['x', 4], 5] }] }) as { paths: unknown[] }).paths
    expect(paths).toEqual([{ coords: [[0, 0], [1, 1]] }, { coords: [[2, 2], [3, 3]] }])
  })
  it('a lines datum with fewer than two pairs is skipped by name', () => {
    const c = compileFamily(series({ type: 'lines', coordinateSystem: 'geo', data: [[[0, 0]], { coords: [] }, 'x', { coords: 'x' }] }, { geo: { map: 'cov-family-world' } }))!
    expect((c.plan as unknown as { paths: unknown[] }).paths).toEqual([])
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[0]', 'series[0].data[1]', 'series[0].data[2]', 'series[0].data[3]'])
  })
  it('a per-datum lineStyle beats the series one; width and colour are independent', () => {
    const paths = (geo({
      type: 'lines',
      lineStyle: { color: '#ser', width: 2 },
      data: [
        { coords: [[0, 0], [1, 1]] },
        { coords: [[0, 0], [1, 1]], lineStyle: { color: '#own', width: 5 } },
        { coords: [[0, 0], [1, 1]], lineStyle: { color: 7 } },
      ],
    }) as { paths: { color?: string; width?: number }[] }).paths
    expect(paths).toEqual([
      { coords: [[0, 0], [1, 1]], color: '#ser', width: 2 },
      { coords: [[0, 0], [1, 1]], color: '#own', width: 5 },
      { coords: [[0, 0], [1, 1]], color: '#ser', width: 2 },
    ])
    // With no styling at all neither key is emitted.
    expect((geo({ type: 'lines', data: [{ coords: [[0, 0], [1, 1]] }] }) as { paths: unknown[] }).paths).toEqual([{ coords: [[0, 0], [1, 1]] }])
  })
  it('effectScatter flips the effect flag; an unsupported type warns and draws nothing', () => {
    expect((geo({ type: 'effectScatter', data: [[1, 2]] }) as { options: { effect: boolean }; points: unknown[] })).toMatchObject({ options: { effect: true }, points: [{ lon: 1, lat: 2 }] })
    expect((geo({ type: 'scatter', data: [] }) as { options: { effect: boolean } }).options.effect).toBe(false)
    const c = compileFamily(series({ type: 'bar', coordinateSystem: 'geo', data: [[1, 2]] }, { geo: { map: 'cov-family-world' } }))!
    expect(c.warnings.map((w) => w.path)).toContain('series[0].type')
    expect((c.plan as unknown as { points: unknown[]; paths: unknown[] })).toMatchObject({ points: [], paths: [] })
  })
})

describe('map', () => {
  const m = (s: Record<string, unknown>, top: Record<string, unknown> = {}): PlanFields => plan(series({ type: 'map', map: 'cov-family-world', ...s }, top))
  it('an unregistered map name warns and renders an empty collection', () => {
    expect((m({ data: [] }) as { geo: GeoJson }).geo.features).toHaveLength(2)
    const c = compileFamily(series({ type: 'map', map: 'missing', data: [] }))!
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].map'])
    expect((c.plan as unknown as { geo: GeoJson }).geo.features).toEqual([])
    // A non-string map name resolves the empty name, which is also unregistered.
    expect(warns(series({ type: 'map', map: 7, data: [] }))).toEqual(['series[0].map'])
  })
  it('a datum must be { name, value }; anything else is skipped by name', () => {
    const c = compileFamily(series({ type: 'map', map: 'cov-family-world', data: [{ name: 'West', value: 4 }, { name: 'East' }, { value: 1 }, 'x', { name: 7, value: 1 }] }))!
    expect((c.plan as unknown as { values: Record<string, number> }).values).toEqual({ West: 4 })
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[1]', 'series[0].data[2]', 'series[0].data[3]', 'series[0].data[4]'])
  })
  it('roam:true warns that the map is static; any other value is silent', () => {
    expect(warns(series({ type: 'map', map: 'cov-family-world', data: [], roam: true }))).toEqual(['series[0].roam'])
    expect(warns(series({ type: 'map', map: 'cov-family-world', data: [], roam: 'scale' }))).toEqual([])
    expect(warns(series({ type: 'map', map: 'cov-family-world', data: [] }))).toEqual([])
  })
  it('nameProperty / border styling pass through only in their declared types', () => {
    const o = (s: Record<string, unknown>): Record<string, unknown> => (m({ data: [], ...s }) as unknown as { options: Record<string, unknown> }).options
    expect(o({ nameProperty: 'iso', itemStyle: { borderColor: '#b', borderWidth: 2 } })).toEqual({ showLabels: false, nameProperty: 'iso', borderColor: '#b', borderWidth: 2 })
    expect(o({ nameProperty: 7, itemStyle: { borderColor: 7, borderWidth: 'x' } })).toEqual({ showLabels: false })
    expect(o({ label: { show: true } })).toEqual({ showLabels: true })
    expect(o({ itemStyle: 'x' })).toEqual({ showLabels: false })
  })
  it('a visualMap supplies stops (two or more) and a domain (both ends)', () => {
    const o = (visualMap: unknown): Record<string, unknown> => (m({ data: [] }, { visualMap }) as unknown as { options: Record<string, unknown> }).options
    expect(o({ min: 0, max: 10, inRange: { color: ['#a', '#b'] } })).toMatchObject({ stops: ['#a', '#b'], domain: { min: 0, max: 10 } })
    // One stop is not a ramp; one end is not a domain.
    expect(o({ min: 0, inRange: { color: ['#a'] } })).toEqual({ showLabels: false })
    expect(o({ inRange: { color: 'x' } })).toEqual({ showLabels: false })
    expect(o('x')).toEqual({ showLabels: false })
    expect(o(undefined)).toEqual({ showLabels: false })
  })
})

describe('polar', () => {
  const p = (s: Record<string, unknown>[], top: Record<string, unknown> = {}): PlanFields => plan({ series: s.map((x) => ({ coordinateSystem: 'polar', ...x })), ...top })
  it('the category axis is the angle axis by default and the radius axis when it says so', () => {
    const angleCat = p([{ type: 'bar', data: [] }], { angleAxis: { data: ['a', 'b'] }, radiusAxis: {} }) as unknown as { axes: Record<string, unknown> }
    expect(angleCat.axes).toMatchObject({ categoryOn: 'angle', categories: ['a', 'b'] })
    const radiusCat = p([{ type: 'bar', data: [] }], { radiusAxis: { type: 'category', data: ['x'] }, angleAxis: { max: 5 } }) as unknown as { axes: Record<string, unknown> }
    expect(radiusCat.axes).toMatchObject({ categoryOn: 'radius', categories: ['x'], valueDomain: { min: 0, max: 5 } })
  })
  it('category labels accept strings, {value} objects and anything stringifiable', () => {
    const axes = p([{ type: 'bar', data: [] }], { angleAxis: { data: ['a', { value: 'b' }, 7, { value: 9 }] } }) as { axes: { categories: string[] } }
    expect(axes.axes.categories).toEqual(['a', 'b', '7', '[object Object]'])
    // No data at all leaves the list empty.
    expect((p([{ type: 'bar', data: [] }]) as { axes: { categories: string[] } }).axes.categories).toEqual([])
  })
  it('a value domain needs a max; min defaults to 0; startAngle and clockwise are optional', () => {
    const axes = (top: Record<string, unknown>): Record<string, unknown> => (p([{ type: 'bar', data: [] }], top) as unknown as { axes: Record<string, unknown> }).axes
    expect(axes({ radiusAxis: { max: 8 } })).toMatchObject({ valueDomain: { min: 0, max: 8 } })
    expect(axes({ radiusAxis: { min: 2, max: 8 } })).toMatchObject({ valueDomain: { min: 2, max: 8 } })
    expect(axes({ radiusAxis: { min: 2 } })['valueDomain']).toBeUndefined()
    expect(axes({ angleAxis: { startAngle: 90 } })['startAngle']).toBeCloseTo(-Math.PI / 2, 9)
    expect(axes({ angleAxis: {} })['startAngle']).toBeUndefined()
    expect(axes({ angleAxis: { clockwise: false } })['clockwise']).toBe(false)
    expect(axes({ angleAxis: { clockwise: true } })['clockwise']).toBeUndefined()
    // A non-object axis behaves like an absent one.
    expect(axes({ angleAxis: 'x', radiusAxis: 'x' })).toEqual({ categories: [], categoryOn: 'angle' })
  })
  it('only bar and line render; every other series warns by INDEX and is skipped', () => {
    const c = compileFamily({ angleAxis: { data: ['a'] }, series: [{ type: 'bar', coordinateSystem: 'polar', data: [1] }, { type: 'scatter', coordinateSystem: 'polar', data: [2] }, 'x', { type: 'line', coordinateSystem: 'polar', data: [3] }] })!
    expect((c.plan as unknown as { series: { name: string; kind: string }[] }).series.map((x) => [x.name, x.kind])).toEqual([['Series 1', 'bar'], ['Series 4', 'line']])
    expect(c.warnings.map((w) => w.path)).toEqual(['series[1].type'])
    expect(c.warnings[0]!.message).toContain('scatter')
  })
  it('a value may be a scalar, a [value, ...] tuple or an object; a bad one becomes NaN', () => {
    const vals = (data: unknown[]): number[] => (p([{ type: 'bar', data }]) as { series: { values: number[] }[] }).series[0]!.values
    expect(vals([1, [2, 'x'], { value: 3 }])).toEqual([1, 2, 3])
    expect(vals(['x', {}, null])).toEqual([Number.NaN, Number.NaN, Number.NaN])
    // A non-array data is read as empty.
    expect((p([{ type: 'bar', data: 'x' }]) as { series: { values: number[] }[] }).series[0]!.values).toEqual([])
  })
  it('a series colour comes from itemStyle then lineStyle; stack rides along only as a string', () => {
    const one = (s: Record<string, unknown>): Record<string, unknown> => (p([{ type: 'line', data: [], ...s }]) as unknown as { series: Record<string, unknown>[] }).series[0]!
    expect(one({ name: 'Load', itemStyle: { color: '#i' }, lineStyle: { color: '#l' }, stack: 'g' })).toMatchObject({ name: 'Load', color: '#i', stack: 'g' })
    expect(one({ lineStyle: { color: '#l' } })).toMatchObject({ color: '#l' })
    expect(one({ itemStyle: { color: 1 }, lineStyle: 'x', stack: 7 })['color']).toBeUndefined()
    expect(one({})['stack']).toBeUndefined()
  })
  it('polar.radius [inner, outer] becomes the hole ratio; every other shape is a full disc', () => {
    const inner = (polar: unknown): number => (p([{ type: 'bar', data: [] }], { polar }) as { polar: { innerRatio: number } }).polar.innerRatio
    expect(inner({ radius: ['30%', '60%'] })).toBeCloseTo(0.5, 9)
    expect(inner({ radius: '60%' })).toBe(0)
    expect(inner({ radius: ['x', '60%'] })).toBe(0)
    expect(inner({ radius: ['30%', 0] })).toBe(0)
    expect(inner({})).toBe(0)
    expect(inner('x')).toBe(0)
    expect(inner(undefined)).toBe(0)
  })
})

describe('parallel', () => {
  const par = (s: Record<string, unknown>, top: Record<string, unknown> = {}): PlanFields => plan(series({ type: 'parallel', ...s }, top))
  it('axes are placed by `dim`, holes are filled with a positional name, and the order follows dim', () => {
    // `dim` places entry 0 at slot 2; entry 1 has no dim, so its LIST index (1)
    // places it at slot 1 — slot 0 is then a hole and gets a positional name.
    const axes = (par({ data: [] }, { parallelAxis: [{ dim: 2, name: 'Third' }, { name: 'First' }] }) as { axes: unknown[] }).axes
    expect(axes).toEqual([{ name: 'dim 0' }, { name: 'First' }, { name: 'Third' }])
    // Without `dim` the list index is the position.
    expect((par({ data: [] }, { parallelAxis: [{ name: 'A' }, { name: 'B' }] }) as { axes: unknown[] }).axes).toEqual([{ name: 'A' }, { name: 'B' }])
    // No parallelAxis, or a non-array one, means no axes.
    expect((par({ data: [] }) as { axes: unknown[] }).axes).toEqual([])
    expect((par({ data: [] }, { parallelAxis: 'x' }) as { axes: unknown[] }).axes).toEqual([])
  })
  it('a category axis carries labels; a value axis carries a two-ended domain; inverse is opt-in', () => {
    const one = (a: Record<string, unknown>): Record<string, unknown> => ((par({ data: [] }, { parallelAxis: [a] }) as unknown as { axes: Record<string, unknown>[] }).axes[0])!
    expect(one({ type: 'category', data: ['a', { value: 'b' }, 3] })).toEqual({ name: 'dim 0', type: 'category', categories: ['a', 'b', '3'] })
    expect(one({ type: 'category' })).toEqual({ name: 'dim 0', type: 'category', categories: [] })
    expect(one({ min: 0, max: 10 })).toEqual({ name: 'dim 0', domain: { min: 0, max: 10 } })
    expect(one({ min: 0 })).toEqual({ name: 'dim 0' })
    // A category axis ignores min/max entirely.
    expect(one({ type: 'category', min: 0, max: 10 })).toEqual({ name: 'dim 0', type: 'category', categories: [] })
    expect(one({ inverse: true })).toMatchObject({ inverse: true })
    expect(one({ inverse: 'yes' })['inverse']).toBeUndefined()
    // A non-object axis entry is still a placeholder with a positional name.
    expect(one('x' as unknown as Record<string, unknown>)).toEqual({ name: 'dim 0' })
    expect(one({ name: 7 })).toEqual({ name: 'dim 0' })
  })
  it('a row must be an array (bare or under `value`); non-scalar members become null', () => {
    const c = compileFamily(series({ type: 'parallel', data: [[1, 'a', null], { value: [2, 3] }, 'x', { value: 'x' }] }))!
    expect((c.plan as unknown as { rows: unknown[] }).rows).toEqual([[1, 'a', null], [2, 3]])
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[2]', 'series[0].data[3]'])
  })
  it('a vertical parallel layout carries into the plan (the host lays out transposed); a horizontal one is the default', () => {
    expect(warns(series({ type: 'parallel', data: [] }, { parallel: { layout: 'vertical' } }))).toEqual([])
    expect(plan(series({ type: 'parallel', data: [] }, { parallel: { layout: 'vertical' } }))).toMatchObject({ orient: 'vertical' })
    expect(warns(series({ type: 'parallel', data: [] }, { parallel: { layout: 'horizontal' } }))).toEqual([])
    expect(plan(series({ type: 'parallel', data: [] }, { parallel: { layout: 'horizontal' } }))).not.toHaveProperty('orient')
    expect(warns(series({ type: 'parallel', data: [] }, { parallel: 'x' }))).toEqual([])
  })
  it('lineStyle width / opacity / colour pass through only in their declared types', () => {
    const o = (lineStyle: unknown): Record<string, unknown> => (par({ data: [], lineStyle }) as unknown as { parallel: Record<string, unknown> }).parallel
    expect(o({ width: 2, opacity: 0.5, color: '#c' })).toEqual({ lineWidth: 2, lineOpacity: 0.5, lineColor: '#c' })
    expect(o({ width: 'x', opacity: null, color: 7 })).toEqual({})
    expect(o('x')).toEqual({})
    expect(o(undefined)).toEqual({})
  })
})

describe('calendar heatmap', () => {
  const cal = (s: Record<string, unknown>, calendar?: unknown, top: Record<string, unknown> = {}): PlanFields =>
    plan(series({ type: 'heatmap', coordinateSystem: 'calendar', ...s }, { ...(calendar === undefined ? {} : { calendar }), ...top }))
  it('range accepts a year number, a "YYYY" string, a "YYYY-MM", a single date and a [start, end] pair', () => {
    const span = (range: unknown): [string, string] => {
      const p = cal({ data: [] }, { range }) as { start: string; end: string }
      return [p.start, p.end]
    }
    expect(span(2024)).toEqual(['2024-01-01', '2024-12-31'])
    expect(span('2024')).toEqual(['2024-01-01', '2024-12-31'])
    expect(span('2024-02')).toEqual(['2024-02-01', '2024-02-29'])
    // A month whose last day is a single digit is zero-padded — September has 30, but February 2023 has 28.
    expect(span('2023-02')).toEqual(['2023-02-01', '2023-02-28'])
    expect(span('2024-03-05')).toEqual(['2024-03-05', '2024-03-05'])
    expect(span(['2024-01-01', '2024-03-31'])).toEqual(['2024-01-01', '2024-03-31'])
  })
  it('an unusable range warns by name and lays nothing out', () => {
    for (const range of [undefined, {}, ['2024-01-01'], [2024, 2025], 'x'] as unknown[]) {
      const c = compileFamily(series({ type: 'heatmap', coordinateSystem: 'calendar', data: [] }, { calendar: { range } }))!
      const paths = c.warnings.map((w) => w.path)
      if (range === 'x') {
        // Any other string is taken as a one-day range rather than rejected.
        expect(paths).toEqual([])
        expect(c.plan).toMatchObject({ start: 'x', end: 'x' })
      } else {
        expect(paths).toEqual(['calendar.range'])
        expect(c.plan).toMatchObject({ start: '', end: '' })
      }
    }
    // No calendar block at all is the same as no range.
    expect(warns(series({ type: 'heatmap', coordinateSystem: 'calendar', data: [] }))).toEqual(['calendar.range'])
    expect(warns(series({ type: 'heatmap', coordinateSystem: 'calendar', data: [] }, { calendar: 'x' }))).toEqual(['calendar.range'])
  })
  it('a vertical calendar carries its orient into the plan (the host lays out transposed) and never warns', () => {
    const vertical = series({ type: 'heatmap', coordinateSystem: 'calendar', data: [] }, { calendar: { range: 2024, orient: 'vertical' } })
    expect(warns(vertical)).toEqual([])
    expect(compileFamily(vertical)!.plan).toMatchObject({ kind: 'calendar', orient: 'vertical' })
    expect(warns(series({ type: 'heatmap', coordinateSystem: 'calendar', data: [] }, { calendar: { range: 2024, orient: 'horizontal' } }))).toEqual([])
    expect(compileFamily(series({ type: 'heatmap', coordinateSystem: 'calendar', data: [] }, { calendar: { range: 2024 } }))!.plan).not.toHaveProperty('orient')
  })
  it('a datum must be [YYYY-MM-DD, value] in array or object form; anything else is skipped', () => {
    const c = compileFamily(series({ type: 'heatmap', coordinateSystem: 'calendar', data: [['2024-01-02', 3], { value: ['2024-01-03', 4] }, ['2024-1-2', 5], [7, 1], ['2024-01-04', 'x'], 'nope'] }, { calendar: { range: 2024 } }))!
    expect((c.plan as unknown as { values: Record<string, number> }).values).toEqual({ '2024-01-02': 3, '2024-01-03': 4 })
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[2]', 'series[0].data[3]', 'series[0].data[4]', 'series[0].data[5]'])
  })
  it('day / month labels show unless turned off; cellSize accepts an array or a scalar', () => {
    const o = (calendar: Record<string, unknown>): Record<string, unknown> => (cal({ data: [] }, { range: 2024, ...calendar }) as unknown as { calendar: Record<string, unknown> }).calendar
    expect(o({})).toEqual({ showDayLabels: true, showMonthLabels: true })
    expect(o({ dayLabel: { show: false }, monthLabel: { show: false } })).toEqual({ showDayLabels: false, showMonthLabels: false })
    expect(o({ dayLabel: 'x', monthLabel: 'x' })).toEqual({ showDayLabels: true, showMonthLabels: true })
    expect(o({ cellSize: [14, 14] })).toMatchObject({ cellSize: 14 })
    expect(o({ cellSize: 12 })).toMatchObject({ cellSize: 12 })
    expect(o({ cellSize: 'auto' })['cellSize']).toBeUndefined()
    expect(o({ dayLabel: { firstDay: 1 } })).toMatchObject({ firstDay: 1 })
    expect(o({ dayLabel: { firstDay: 'x' } })['firstDay']).toBeUndefined()
  })
  it('a visualMap supplies stops (two or more) and a domain (both ends)', () => {
    const o = (visualMap: unknown): Record<string, unknown> => (cal({ data: [] }, { range: 2024 }, { visualMap }) as unknown as { calendar: Record<string, unknown> }).calendar
    expect(o({ min: 0, max: 9, inRange: { color: ['#a', '#b', 3] } })).toMatchObject({ stops: ['#a', '#b'], domain: { min: 0, max: 9 } })
    expect(o({ min: 0, inRange: { color: ['#a'] } })).toEqual({ showDayLabels: true, showMonthLabels: true })
    expect(o(undefined)).toEqual({ showDayLabels: true, showMonthLabels: true })
  })
})

describe('themeRiver', () => {
  it('groups [date, value, name] triples into one stream per name over the sorted dates', () => {
    const p = plan(series({ type: 'themeRiver', data: [['2024-01-02', 2, 'A'], ['2024-01-01', 1, 'A'], ['2024-01-01', 5, 'B'], ['2024-01-02', 1, 'A']] })) as { series: { name: string; values: number[] }[]; river: { categories: string[] } }
    expect(p.river.categories).toEqual(['2024-01-01', '2024-01-02'])
    // Repeated (date, name) pairs SUM; a stream with no value on a date contributes 0.
    expect(p.series).toEqual([{ name: 'A', values: [1, 3] }, { name: 'B', values: [5, 0] }])
  })
  it('a datum that is not [string, number, string] is skipped by name', () => {
    const c = compileFamily(series({ type: 'themeRiver', data: [['2024-01-01', 1, 'A'], ['2024-01-01', 1], [1, 1, 'A'], ['2024-01-01', 'x', 'A'], ['2024-01-01', 1, 7], 'x'] }))!
    expect((c.plan as unknown as { series: unknown[] }).series).toHaveLength(1)
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[1]', 'series[0].data[2]', 'series[0].data[3]', 'series[0].data[4]', 'series[0].data[5]'])
  })
  it('labels show unless label.show is exactly false', () => {
    const show = (label: unknown): boolean => (plan(series({ type: 'themeRiver', data: [], label })) as { river: { showLabels: boolean } }).river.showLabels
    expect(show(undefined)).toBe(true)
    expect(show({ show: false })).toBe(false)
    expect(show(7)).toBe(true)
  })
})

describe('boxplot', () => {
  it('maps [min, q1, median, q3, max] onto the x categories with a 1-based fallback', () => {
    const rows = (plan({ xAxis: { data: ['Mon'] }, series: [{ type: 'boxplot', data: [[1, 2, 3, 4, 5], { value: [2, 3, 4, 5, 6] }] }] }) as { rows: Record<string, unknown>[] }).rows
    expect(rows).toEqual([
      { x: 'Mon', min: 1, q1: 2, median: 3, q3: 4, max: 5, outliers: [] },
      { x: '2', min: 2, q1: 3, median: 4, q3: 5, max: 6, outliers: [] },
    ])
    // A non-numeric member becomes 0 rather than dropping the box.
    expect((plan(series({ type: 'boxplot', data: [['x', 2, 3, 4, 5]] })) as { rows: { min: number }[] }).rows[0]!.min).toBe(0)
  })
  it('a datum shorter than five is skipped by name', () => {
    const c = compileFamily(series({ type: 'boxplot', data: [[1, 2, 3, 4], 'x', { value: [1] }, [1, 2, 3, 4, 5]] }))!
    expect((c.plan as unknown as { rows: unknown[] }).rows).toHaveLength(1)
    expect(c.warnings.map((w) => w.path)).toEqual(['series[0].data[0]', 'series[0].data[1]', 'series[0].data[2]'])
  })
  it('a companion scatter series carries the outliers as [categoryIndex, value]', () => {
    const rows = (plan({
      series: [
        { type: 'boxplot', data: [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]] },
        { type: 'scatter', data: [[0, 9], [1, 11], [9, 1], [0], 'x', ['a', 1], [1, 'b']] },
        { type: 'scatter', data: 'not-an-array' },
        'junk',
      ],
    }) as { rows: { outliers: number[] }[] }).rows
    expect(rows.map((r) => r.outliers)).toEqual([[9], [11]])
    // Without the companion series every box has an empty outlier list.
    expect((plan(series({ type: 'boxplot', data: [[1, 2, 3, 4, 5]] })) as { rows: { outliers: number[] }[] }).rows[0]!.outliers).toEqual([])
  })
  it('itemStyle colour / borderColor become the fill and stroke, and only strings do', () => {
    const p = (itemStyle: unknown): Record<string, unknown> => plan(series({ type: 'boxplot', data: [], itemStyle })) as unknown as Record<string, unknown>
    expect(p({ color: '#f', borderColor: '#s' })).toMatchObject({ fill: '#f', stroke: '#s' })
    expect(p({ color: 1, borderColor: null })).toMatchObject({ fill: undefined, stroke: undefined })
    expect(p('x')).toMatchObject({ fill: undefined, stroke: undefined })
  })
})
