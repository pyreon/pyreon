import { compileOption } from './option'
import { readToolbox } from './option-toolbox'

describe('option.toolbox', () => {
  it('maps every ECharts feature, and names a custom tool and a y-axis box zoom', () => {
    const w: string[] = []
    const t = readToolbox({ toolbox: { feature: { saveAsImage: { type: 'svg', name: 'q3' }, restore: {}, dataView: { readOnly: true }, dataZoom: { yAxisIndex: 0 }, magicType: { type: ['line', 'stack', 'pie'] }, myTool: { onclick: () => {} }, brush: {} } } }, (_c, p) => w.push(p))!
    expect(t).toMatchObject({ saveAsImage: true, imageType: 'svg', name: 'q3', restore: true, dataView: true, dataZoom: true, magicType: ['line', 'stack'], brush: ['rect', 'polygon', 'lineX', 'lineY', 'keep', 'clear'] })
    expect(w).toEqual(['toolbox.feature.dataZoom.yAxisIndex', 'toolbox.feature.magicType.type', 'toolbox.feature.myTool'])
  })

  it('a hidden toolbox or feature is absent; the box zoom brings a window even without a dataZoom component', () => {
    expect(readToolbox({ toolbox: { show: false, feature: { restore: {} } } }, () => {})).toBeUndefined()
    expect(readToolbox({ toolbox: { feature: { restore: { show: false } } } }, () => {})!.restore).toBeUndefined()
    const c = compileOption({ toolbox: { feature: { dataZoom: {} } }, xAxis: { data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] })
    expect(c.warnings).toEqual([])
    expect(c.zoom).toMatchObject({ inside: false, slider: false, window: { start: 0, end: 1 } })
  })
})
