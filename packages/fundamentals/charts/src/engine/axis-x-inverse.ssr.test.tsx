// @vitest-environment node
// A reversed x axis in the SERVER HTML: the first frame is the reversed chart,
// the table keeps data order.
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { Axis, Bar, Chart } from './grammar'
// Registers the first-frame serializer, as a server entry does.
import '../svg'

interface Row { m: string; v: number }
const DATA: Row[] = [{ m: 'Jan', v: 1200 }, { m: 'Feb', v: 3400 }, { m: 'Mar', v: 2100 }]

const html = (inverse: boolean): Promise<string> =>
  renderToString(h(Chart<Row>, { data: DATA, x: 'm', width: 300, height: 200, title: 'Sales', animate: false }, h(Bar<Row>, { y: 'v', label: 'Sales' }), h(Axis, { x: true, inverse })))

const frame = (s: string): string => /<div data-pyreon-chart-frame=""[^>]*>(<svg[\s\S]*?<\/svg>)<\/div>/.exec(s)![1]!
const order = (svg: string): string[] => [...svg.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="middle"[^>]*>(Jan|Feb|Mar)</g)].sort((p, q) => Number(p[1]) - Number(q[1])).map((m) => m[2]!)

describe('server-rendered xInverse', () => {
  it('the first frame lays the categories out right to left', async () => {
    expect(order(frame(await html(false)))).toEqual(['Jan', 'Feb', 'Mar'])
    expect(order(frame(await html(true)))).toEqual(['Mar', 'Feb', 'Jan'])
  })
  it('the table rows stay in data order', async () => {
    const out = await html(true)
    expect(out.indexOf('<th scope="row">Jan</th>')).toBeLessThan(out.indexOf('<th scope="row">Feb</th>'))
    expect(out.indexOf('<th scope="row">Feb</th>')).toBeLessThan(out.indexOf('<th scope="row">Mar</th>'))
  })
})
