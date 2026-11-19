// @vitest-environment node
// Bars on a numeric x axis in the SERVER HTML: the first frame is the same bars the client draws, the table is unchanged.
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { Axis, Bar, Chart } from './grammar'
import '../svg'

interface Row { x: number; v: number }
const DATA: Row[] = [{ x: 1, v: 10 }, { x: 2, v: 14 }, { x: 5, v: 8 }, { x: 6, v: 12 }]

const html = (extra: Record<string, unknown> = {}): Promise<string> =>
  renderToString(h(Chart<Row>, { data: DATA, xValue: 'x', width: 400, height: 200, animate: false, ...extra }, h(Bar<Row>, { y: 'v', label: 'V' }), h(Axis, { x: true })))

const frame = (s: string): string => /<div data-pyreon-chart-frame=""[^>]*>(<svg[\s\S]*?<\/svg>)<\/div>/.exec(s)![1]!
/** The x of each bar's left edge (the path's M) in drawing order. */
const lefts = (svg: string): number[] => [...svg.matchAll(/<path d="M([\d.]+)/g)].map((m) => Number(m[1]))

describe('server-rendered bars on a numeric x axis', () => {
  it('the first frame places each bar at its x: the gap between x=2 and x=5 shows', async () => {
    const xs = lefts(frame(await html())).sort((a, b) => a - b)
    expect(xs.length).toBe(4)
    const step = xs[1]! - xs[0]!
    expect(xs[2]! - xs[1]!).toBeCloseTo(step * 3, 0)
    expect(xs[3]! - xs[2]!).toBeCloseTo(step, 0)
  })
  it('the table still has one row per datum', async () => {
    const out = await html()
    expect((out.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
})
