import { describe, expect, it } from 'vitest'
import { compileFamily } from './option-family'
import { familyHostNode } from './family-host'
import { registerMap } from './geo'
import { PieChart, GaugeChart } from './PieChart'
import { RadarChart } from './RadarChart'
import { CandlestickChart } from './CandlestickChart'
import { HeatmapChart } from './HeatmapChart'
import { FunnelChart } from './FunnelChart'
import { TreemapChart } from './TreemapChart'
import { SunburstChart } from './SunburstChart'
import { TreeChart } from './TreeChart'
import { SankeyChart } from './SankeyChart'
import { GraphChart } from './GraphChart'
import { CalendarChart } from './CalendarChart'
import { ParallelChart } from './ParallelChart'
import { PolarChart } from './PolarChart'
import { RiverChart } from './RiverChart'
import { MapChart } from './MapChart'
import type { EChartsOption } from './option'

registerMap('host-test', {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } }],
})

const tree = [{ name: 'r', children: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }] }]
const cases: { name: string; option: EChartsOption; host: unknown }[] = [
  { name: 'pie', option: { series: [{ type: 'pie', data: [{ name: 'x', value: 1 }] }] }, host: PieChart },
  { name: 'gauge', option: { series: [{ type: 'gauge', data: [{ value: 40 }] }] }, host: GaugeChart },
  { name: 'radar', option: { radar: { indicator: [{ name: 'a', max: 10 }, { name: 'b', max: 10 }] }, series: [{ type: 'radar', data: [{ name: 's', value: [1, 2] }] }] }, host: RadarChart },
  { name: 'candlestick', option: { xAxis: { data: ['d1'] }, yAxis: {}, series: [{ type: 'candlestick', data: [[1, 2, 0, 3]] }] }, host: CandlestickChart },
  { name: 'heatmap', option: { xAxis: { data: ['a'] }, yAxis: { data: ['b'] }, series: [{ type: 'heatmap', data: [[0, 0, 5]] }] }, host: HeatmapChart },
  { name: 'funnel', option: { series: [{ type: 'funnel', data: [{ name: 'x', value: 1 }] }] }, host: FunnelChart },
  { name: 'treemap', option: { series: [{ type: 'treemap', data: tree }] }, host: TreemapChart },
  { name: 'sunburst', option: { series: [{ type: 'sunburst', data: tree }] }, host: SunburstChart },
  { name: 'tree', option: { series: [{ type: 'tree', data: tree }] }, host: TreeChart },
  { name: 'sankey', option: { series: [{ type: 'sankey', data: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 1 }] }] }, host: SankeyChart },
  { name: 'graph', option: { series: [{ type: 'graph', data: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b' }] }] }, host: GraphChart },
  { name: 'calendar', option: { calendar: { range: '2024' }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2024-01-01', 3]] }] }, host: CalendarChart },
  { name: 'parallel', option: { parallelAxis: [{ dim: 0, name: 'a' }, { dim: 1, name: 'b' }], series: [{ type: 'parallel', data: [[1, 2]] }] }, host: ParallelChart },
  { name: 'polar', option: { polar: {}, angleAxis: { type: 'category', data: ['a', 'b'] }, radiusAxis: {}, series: [{ type: 'bar', coordinateSystem: 'polar', data: [1, 2] }] }, host: PolarChart },
  { name: 'themeRiver', option: { singleAxis: { type: 'time' }, series: [{ type: 'themeRiver', data: [['2024-01-01', 3, 'a'], ['2024-01-02', 4, 'a']] }] }, host: RiverChart },
  { name: 'map', option: { series: [{ type: 'map', map: 'host-test', data: [{ name: 'A', value: 1 }] }] }, host: MapChart },
]

describe('familyHostNode', () => {
  for (const c of cases) {
    it(`routes a ${c.name} plan to its canvas host`, () => {
      const fam = compileFamily(c.option)
      expect(fam, `${c.name} did not compile as a family: ${JSON.stringify(fam?.warnings ?? 'null')}`).not.toBeNull()
      const node = familyHostNode(fam!.plan, { width: 200, height: 120 })
      expect(node).not.toBeNull()
      expect(node!.type).toBe(c.host)
    })
  }
  it('tags the host hit with the family kind', () => {
    const fam = compileFamily({ series: [{ type: 'pie', data: [{ name: 'x', value: 1 }] }] })!
    const seen: unknown[] = []
    const node = familyHostNode(fam.plan, { width: 100, height: 100, onSelect: (kind, hit) => seen.push([kind, hit]) })!
    const props = node.props as { onSelect: (i: number) => void }
    props.onSelect(0)
    expect(seen).toEqual([['pie', 0]])
  })
  it('the two host-less families answer null (the facade SVG is their picture)', () => {
    const single = compileFamily({ singleAxis: { type: 'value' }, series: [{ type: 'scatter', coordinateSystem: 'singleAxis', data: [[1, 2]] }] })!
    expect(familyHostNode(single.plan, { width: 100, height: 100 })).toBeNull()
  })
})
