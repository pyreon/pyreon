import { describe, expect, it } from 'vitest'
import { compileOption, compiledCommands, optionToSvg } from './option'
import { measureApprox, renderSvg } from './svg'

const option = {
  title: { text: 'Sales', subtext: 'Q1' },
  legend: {},
  xAxis: { data: ['a', 'b', 'c'] },
  yAxis: {},
  series: [{ type: 'bar', name: 'north', data: [3, 1, 2] }, { type: 'line', name: 'south', data: [1, 2, 3] }],
  graphic: [{ type: 'text', left: 10, top: 10, style: { text: 'note' } }],
}

describe('compiledCommands', () => {
  it('is exactly the picture optionToSvg paints: same commands, same svg bytes', () => {
    const compiled = compileOption(option, { width: 400, height: 240 })
    const { cmds, top } = compiledCommands(compiled, option, measureApprox())
    expect(top).toBeGreaterThan(0)
    expect(renderSvg(cmds, 400, 240, { title: 'Sales' })).toBe(optionToSvg(option, { width: 400, height: 240 }))
    // Title, subtitle, a legend swatch per series, bars, a polyline and the graphic note all land.
    const texts = cmds.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : ''))
    expect(texts).toContain('Sales')
    expect(texts).toContain('Q1')
    expect(texts).toContain('note')
    expect(cmds.filter((c) => c.kind === 'polyline').length).toBeGreaterThan(0)
  })
  it('a title-less, legend-less option has no offset and starts with the plot', () => {
    const bare = { xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }
    const compiled = compileOption(bare, { width: 200, height: 100 })
    expect(compiledCommands(compiled, bare, measureApprox()).top).toBe(0)
  })
})
