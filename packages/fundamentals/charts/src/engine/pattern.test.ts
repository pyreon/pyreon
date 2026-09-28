import { describe, expect, it } from 'vitest'
import { bars, resolveMarks } from './marks'
import { defaultTheme, renderChart } from './render'
import { collectPatterns, renderSvg } from './svg'

const pattern = { kind: 'cross' as const, color: '#ffffff', spacing: 7, width: 1.5 }

describe('pattern fills', () => {
  it('crosses mark resolution and bar geometry as plain data', () => {
    const series = resolveMarks([{ value: 4 }], [bars((d: { value: number }) => d.value, { pattern })])
    expect(series[0]!.pattern).toEqual(pattern)
    const commands = renderChart({ width: 220, height: 140, categories: ['A'], series, theme: defaultTheme, showXAxis: true, showYAxis: true, showGrid: true }, () => 10)
    expect(commands.find((c) => c.kind === 'rect' && c.pattern !== undefined)).toMatchObject({ pattern })
  })

  it('serializes a clipped overlay without replacing the base fill', () => {
    const command = { kind: 'rect' as const, rect: { x: 1, y: 2, w: 30, h: 20 }, fill: '#123456', pattern }
    const collected = collectPatterns([command], 'chart')
    expect(collected.defs).toContain('<pattern id="chart-p0"')
    const svg = renderSvg([command], 40, 30)
    expect(svg).toContain('fill="#123456"')
    expect(svg).toContain('fill="url(#pyreon-chart-p0)"')
  })

})
