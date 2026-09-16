// The geo series parser on authored input it has to reject or reshape: a
// non-object or non-geo series beside a map, heatmap samples in both the
// array and {value} forms (and malformed ones), a pie's radius as a scalar or
// an [inner, outer] pair, pie and map data that are not usable, and a geo
// heatmap's point size. Every rejection must be NAMED on the datum it drops.
import { describe, expect, it } from 'vitest'
import { registerMap } from './geo-web'
import { compileFamily } from './option-family'
import type { EChartsOption } from './option'

registerMap('geo-parse-world', {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'W' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'E' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
  ],
})

// The geo family is chosen by a LEADING geo series, so every case is anchored
// by one; the series under test is therefore always series[1].
const ANCHOR = { type: 'scatter', coordinateSystem: 'geo', data: [[1, 1]] }
const geo = (series: unknown[], extra: Record<string, unknown> = {}) =>
  compileFamily({ geo: { map: 'geo-parse-world' }, series: [ANCHOR, ...series], ...extra } as EChartsOption)!
const warned = (f: ReturnType<typeof geo>, path: string) => f.warnings.some((w) => w.path === path)
const plan = (f: ReturnType<typeof geo>) => f.plan as unknown as Record<string, unknown>

describe('which series sit on the geo', () => {
  it('a non-object series entry is skipped silently', () => {
    expect(geo([7]).warnings).toEqual([])
  })

  it('a series NOT on the geo is named and skipped', () => {
    expect(warned(geo([{ type: 'scatter', data: [[1, 1]] }]), 'series[1].coordinateSystem')).toBe(true)
  })

  it('a series with no type is not on the geo', () => {
    expect(warned(geo([{ data: [[1, 1]] }]), 'series[1].coordinateSystem')).toBe(true)
  })

  it('a map joins the geo through geoIndex', () => {
    expect(warned(geo([{ type: 'map', geoIndex: 0, data: [{ name: 'W', value: 3 }] }]), 'series[1].coordinateSystem')).toBe(false)
  })
})

describe('geo heatmap samples', () => {
  it('accepts [lon, lat, value] and { value: [lon, lat, value] }', () => {
    const f = geo([{ type: 'heatmap', coordinateSystem: 'geo', data: [[1, 2, 3], { value: [4, 5, 6] }] }])
    expect(f.warnings).toEqual([])
    expect(plan(f)['heat']).toEqual([{ lon: 1, lat: 2, value: 3 }, { lon: 4, lat: 5, value: 6 }])
  })

  it('names and skips anything else, per datum', () => {
    const f = geo([{ type: 'heatmap', coordinateSystem: 'geo', data: ['x', [1, 2], { value: 'no' }, [1, 'lat', 3]] }])
    for (const i of [0, 1, 2, 3]) expect(warned(f, `series[1].data[${i}]`), `datum ${i}`).toBe(true)
  })

  it('pointSize sets the blob radius, and blurSize stands in for it', () => {
    const r = (s: Record<string, unknown>) => plan(geo([{ type: 'heatmap', coordinateSystem: 'geo', data: [[1, 1, 1]], ...s }]))['heatRadius']
    expect(r({ pointSize: 17 })).toBe(17)
    expect(r({ blurSize: 9 })).toBe(9)
  })
})

describe('pies on the geo', () => {
  const pie = (over: Record<string, unknown>) =>
    geo([{ type: 'pie', coordinateSystem: 'geo', center: [5, 5], data: [{ name: 'a', value: 1 }, { value: 2 }], ...over }])
  const firstPie = (f: ReturnType<typeof geo>) => (plan(f)['pies'] as { radius: number; innerRadius: number; slices: { label: string }[] }[])[0]!

  it('a scalar radius is the outer radius with no hole', () => {
    const p = firstPie(pie({ radius: 30 }))
    expect([p.radius, p.innerRadius]).toEqual([30, 0])
  })

  it('an [inner, outer] radius makes a donut, the hole as a share of the outer', () => {
    const p = firstPie(pie({ radius: [15, 30] }))
    expect([p.radius, p.innerRadius]).toEqual([30, 0.5])
  })

  it('no radius takes the default size', () => {
    expect(firstPie(pie({})).radius).toBe(20)
  })

  it('a slice without a name gets an empty label; a slice without a numeric value is named', () => {
    expect(firstPie(pie({})).slices.map((s) => s.label)).toEqual(['a', ''])
    expect(warned(pie({ data: [{ name: 'x' }, 'nope'] }), 'series[1].data[0]')).toBe(true)
    expect(warned(pie({ data: [{ name: 'x' }, 'nope'] }), 'series[1].data[1]')).toBe(true)
  })

  it('a pie with no [lon, lat] centre is named and dropped', () => {
    expect(warned(geo([{ type: 'pie', coordinateSystem: 'geo', data: [1] }]), 'series[1].center')).toBe(true)
  })
})

describe('map region data on the geo', () => {
  it('a datum that is not { name, value } is named', () => {
    const f = geo([{ type: 'map', geoIndex: 0, data: [7, { value: 1 }, { name: 'W' }] }])
    for (const i of [0, 1, 2]) expect(warned(f, `series[1].data[${i}]`), `datum ${i}`).toBe(true)
  })
})

describe('what reaches the geo host', () => {
  it('heat stops from a visualMap, a lines trail, and paths with and without their own colour', async () => {
    const { familyHostNode } = await import('./family-host')
    const f = geo(
      [
        { type: 'heatmap', coordinateSystem: 'geo', data: [[1, 1, 1]] },
        {
          type: 'lines',
          coordinateSystem: 'geo',
          effect: { show: true, period: 3 },
          data: [{ coords: [[1, 1], [9, 9]], lineStyle: { color: '#123456' } }, { coords: [[2, 2], [8, 8]] }],
        },
      ],
      { visualMap: { inRange: { color: ['#000', '#fff'] } } },
    )
    const props = familyHostNode(f.plan, { width: 300, height: 200 })!.props as Record<string, unknown>
    expect(props['heatStops']).toEqual(['#000', '#fff'])
    expect(props['trail']).toBeDefined()
    const paths = props['paths'] as { color?: string }[]
    expect(paths.some((p) => p.color === '#123456')).toBe(true)
    expect(paths.some((p) => p.color === undefined)).toBe(true)
  })

  it('without stops or an effect, the host gets neither key', async () => {
    const { familyHostNode } = await import('./family-host')
    const props = familyHostNode(geo([]).plan, { width: 300, height: 200 })!.props as Record<string, unknown>
    expect('heatStops' in props).toBe(false)
    expect('trail' in props).toBe(false)
  })
})

describe('geo series edges', () => {
  it('a geo series with no data array contributes nothing and does not throw', () => {
    expect(() => geo([{ type: 'heatmap', coordinateSystem: 'geo' }])).not.toThrow()
  })

  it('a key with no geo mapping is named', () => {
    expect(warned(geo([{ type: 'scatter', coordinateSystem: 'geo', data: [[1, 1]], stack: 'x' }]), 'series[1].stack')).toBe(true)
  })

  it('geo.zoom reaches the map options; without it there is no zoom key', () => {
    const withZoom = compileFamily({ geo: { map: 'geo-parse-world', zoom: 2 }, series: [ANCHOR] } as EChartsOption)!
    expect((withZoom.plan as unknown as { map: { zoom?: number } }).map.zoom).toBe(2)
    expect('zoom' in (plan(geo([]))['map'] as object)).toBe(false)
  })
})
