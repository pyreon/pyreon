import { describe, expect, it } from 'vitest'
import { AXIS_POINTER_DEFAULTS, axisPointerCmds } from './axis-pointer'

const plot = { x: 40, y: 10, w: 200, h: 100 }
const at = { x: 90, band: 50, y: 60, categoryLabel: 'Tue', valueLabel: '42' }

describe('axis pointer geometry', () => {
  it('line: one vertical line through the column, plot top to bottom', () => {
    expect(axisPointerCmds(plot, at, { ...AXIS_POINTER_DEFAULTS, type: 'line' })).toEqual([{ kind: 'line', from: { x: 90, y: 10 }, to: { x: 90, y: 110 }, stroke: '#555555', width: 1, dash: undefined }])
  })
  it('shadow: the whole band, as ECharts shades it', () => {
    expect(axisPointerCmds(plot, at, { ...AXIS_POINTER_DEFAULTS, type: 'shadow' })).toEqual([{ kind: 'rect', rect: { x: 65, y: 10, w: 50, h: 100 }, fill: 'rgba(150,150,150,0.3)' }])
  })
  it('cross: both lines plus a label box on each axis', () => {
    const cmds = axisPointerCmds(plot, at, { ...AXIS_POINTER_DEFAULTS, type: 'cross', label: true, dashed: true })
    expect(cmds.filter((c) => c.kind === 'line')).toHaveLength(2)
    expect(cmds.filter((c) => c.kind === 'text').map((c) => (c as { text: string }).text)).toEqual(['Tue', '42'])
    expect((cmds[0] as { dash?: number[] }).dash).toEqual([4, 4])
  })
  it('none draws nothing; a cross off the plot draws only its vertical line', () => {
    expect(axisPointerCmds(plot, at, { ...AXIS_POINTER_DEFAULTS, type: 'none' })).toEqual([])
    expect(axisPointerCmds(plot, { ...at, y: null }, { ...AXIS_POINTER_DEFAULTS, type: 'cross' })).toHaveLength(1)
  })
})
