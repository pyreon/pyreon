import { describe, expect, it } from 'vitest'
import { compileOption, compiledCommands, optionBrushSelection, zoomedView } from './option'
import { readBrush } from './option-brush'
import { readToolbox } from './option-toolbox'
import { brushAreaFromDrag } from './brush-area'
import { layoutChart } from './render'
import type { MeasureText } from './types'

const measure: MeasureText = (text, size) => text.length * size * 0.6

describe('option.brush', () => {
  it('reads type, mode, outOfBrush alpha, toolbox and seriesIndex, with ECharts defaults', () => {
    const w: string[] = []
    expect(readBrush({ brush: {} }, (_c, p) => w.push(p))).toEqual({ brushType: 'rect', multiple: false, outOpacity: 0.1, tools: ['rect', 'polygon', 'keep', 'clear'], seriesIndex: [] })
    const b = readBrush({ brush: { brushType: 'lineX', brushMode: 'multiple', outOfBrush: { colorAlpha: 0.3, symbolSize: 2 }, toolbox: ['lineX', 'clear', 'circle'], seriesIndex: 1, inBrush: { color: 'red' }, xAxisIndex: 1 } }, (_c, p) => w.push(p))!
    expect(b).toEqual({ brushType: 'lineX', multiple: true, outOpacity: 0.3, tools: ['lineX', 'clear'], seriesIndex: [1] })
    expect(w).toEqual(['brush.toolbox', 'brush.outOfBrush.symbolSize', 'brush.inBrush', 'brush.xAxisIndex'])
  })

  it('toolbox.feature.brush takes its own type, else the component toolbox, else every tool', () => {
    const b = readBrush({ brush: { toolbox: ['lineY'] } }, () => {})
    expect(readToolbox({ toolbox: { feature: { brush: { type: ['rect', 'clear'] } } } }, () => {}, b)!.brush).toEqual(['rect', 'clear'])
    expect(readToolbox({ toolbox: { feature: { brush: {} } } }, () => {}, b)!.brush).toEqual(['lineY'])
    expect(readToolbox({ toolbox: { feature: { brush: {} } } }, () => {})!.brush).toEqual(['rect', 'polygon', 'lineX', 'lineY', 'keep', 'clear'])
  })

  const option = {
    brush: { seriesIndex: [0], outOfBrush: { colorAlpha: 0.2 } },
    toolbox: { feature: { brush: { type: ['lineX'] } } },
    xAxis: { data: ['a', 'b', 'c', 'd'] },
    yAxis: {},
    series: [{ type: 'bar', data: [1, 2, 3, 4] }, { type: 'line', data: [4, 3, 2, 1] }],
  }

  it('compiles with no warnings, selects only the listed series, and dims what the areas miss', () => {
    const c = compileOption(option, { width: 400, height: 240 })
    expect(c.warnings).toEqual([])
    const top = compiledCommands(c, option, measure).top
    const view = zoomedView(c, top)
    const plot = layoutChart(view.spec, measure).plot
    const area = brushAreaFromDrag('lineX', plot, plot.x, plot.y, plot.x + plot.w / 2 - 1, plot.y)
    const sel = optionBrushSelection(c, view.spec, measure, [area])
    expect(sel[0]!.dataIndex.length).toBeGreaterThan(0)
    expect(sel[0]!.dataIndex.length).toBeLessThan(4)
    expect(sel[1]!.dataIndex).toEqual([])
    const plain = JSON.stringify(compiledCommands(c, option, measure).cmds)
    const brushed = compiledCommands(c, option, measure, undefined, [], [area]).cmds
    expect(JSON.stringify(brushed)).not.toBe(plain)
    expect(brushed.some((cmd) => cmd.kind === 'polyline')).toBe(true)
  })
})
