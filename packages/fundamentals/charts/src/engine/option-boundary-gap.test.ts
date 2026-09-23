/**
 * ECharts' category-axis `boundaryGap`: by default a line point sits at its
 * band centre, under its label and over any bar in the band; with
 * `boundaryGap: false` the points run edge to edge and the labels move onto
 * them. Either way a point and its label share an x.
 */
import { describe, expect, it } from 'vitest'
import { compileOption, compiledCommands } from './option'
import type { EChartsOption } from './option'

type Cmd = { kind: string; text?: string; at?: { x: number }; points?: { x: number }[]; rect?: { x: number; w: number } }
const cats = ['Jan', 'Feb', 'Mar', 'Apr']
const run = (o: Record<string, unknown>) => {
  const c = compileOption({ animation: false, xAxis: { type: 'category', data: cats }, yAxis: { type: 'value' }, ...o } as EChartsOption)
  const cmds = compiledCommands(c, {}, (t: string) => t.length * 6).cmds as Cmd[]
  const labelX = cats.map((n) => cmds.find((x) => x.kind === 'text' && x.text === n)!.at!.x)
  const line = cmds.find((x) => x.kind === 'polyline')!.points!.map((p) => p.x)
  return { c, cmds, labelX, line }
}

describe('boundaryGap', () => {
  it('default: each line point sits on its category label', () => {
    const r = run({ series: [{ type: 'line', data: [1, 3, 2, 4] }] })
    expect(r.c.spec.boundaryGap).toBeUndefined()
    r.line.forEach((x, i) => expect(x).toBeCloseTo(r.labelX[i]!, 5))
  })

  it("a line over bars sits over each bar's centre", () => {
    const r = run({ series: [{ type: 'bar', data: [1, 3, 2, 4] }, { type: 'line', data: [1, 3, 2, 4] }] })
    const bars = r.cmds.filter((x) => x.kind === 'rect' && x.rect !== undefined && x.rect.w > 5 && x.rect.w < 200).slice(-4)
    bars.forEach((b, i) => expect(b.rect!.x + b.rect!.w / 2).toBeCloseTo(r.line[i]!, 5))
  })

  it('boundaryGap false: the points run edge to edge and the labels sit on them', () => {
    const band = run({ series: [{ type: 'line', data: [1, 3, 2, 4] }] })
    const edge = run({ xAxis: { type: 'category', data: cats, boundaryGap: false }, series: [{ type: 'line', data: [1, 3, 2, 4] }] })
    expect(edge.c.spec.boundaryGap).toBe(false)
    edge.line.forEach((x, i) => expect(x).toBeCloseTo(edge.labelX[i]!, 5))
    // Wider than the band layout: the ends reach the plot edges.
    expect(edge.line[3]! - edge.line[0]!).toBeGreaterThan(band.line[3]! - band.line[0]!)
  })

  it('a chart with bars keeps its bands even when boundaryGap is false', () => {
    const r = run({ xAxis: { type: 'category', data: cats, boundaryGap: false }, series: [{ type: 'bar', data: [1, 3, 2, 4] }, { type: 'line', data: [1, 3, 2, 4] }] })
    r.line.forEach((x, i) => expect(x).toBeCloseTo(r.labelX[i]!, 5))
    expect(r.line[0]! - r.cmds.filter((x) => x.kind === 'rect' && x.rect !== undefined && x.rect.w > 5 && x.rect.w < 200).slice(-4)[0]!.rect!.x).toBeGreaterThan(0)
  })

  it('a value x axis ignores it', () => {
    const c = compileOption({ xAxis: { type: 'value', boundaryGap: false }, yAxis: {}, series: [{ type: 'scatter', data: [[1, 2]] }] })
    expect(c.spec.boundaryGap).toBeUndefined()
  })

  it('a markLine at a category NAME stands on that category, and a markArea spans its bands', () => {
    const r = run({ series: [{ type: 'line', data: [1, 3, 2, 4], markLine: { data: [{ xAxis: 'Feb' }] }, markArea: { data: [[{ xAxis: 'Feb' }, { xAxis: 'Mar' }]] } }] })
    expect(r.c.warnings).toEqual([])
    const vline = r.cmds.find((x) => x.kind === 'line' && (x as { dash?: number[] }).dash !== undefined) as unknown as { from: { x: number } }
    expect(vline.from.x).toBeCloseTo(r.labelX[1]!, 5)
    const band = r.labelX[1]! - r.labelX[0]!
    const area = r.cmds.find((x) => x.kind === 'rect' && x.rect !== undefined && Math.abs(x.rect.w - 2 * band) < 0.01)
    expect(area!.rect!.x).toBeCloseTo(r.labelX[1]! - band / 2, 5)
  })

  it('under boundaryGap false the markLine stands on the edge-to-edge point', () => {
    const r = run({ xAxis: { type: 'category', data: cats, boundaryGap: false }, series: [{ type: 'line', data: [1, 3, 2, 4], markLine: { data: [{ xAxis: 2 }] } }] })
    const vline = r.cmds.find((x) => x.kind === 'line' && (x as { dash?: number[] }).dash !== undefined) as unknown as { from: { x: number } }
    expect(vline.from.x).toBeCloseTo(r.line[2]!, 5)
  })
})
