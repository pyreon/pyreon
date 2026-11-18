// @vitest-environment node
// An inverted value axis in the SERVER HTML: the first frame draws the flip
// (bars hang from the top) and the table keeps the data order.
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { Axis, Bar, Chart } from './grammar'
// Registers the first-frame serializer, as a server entry does.
import '../svg'

interface Row { m: string; v: number }
const DATA: Row[] = [{ m: 'Jan', v: 1200 }, { m: 'Feb', v: 3400 }]

const html = (inverse: boolean): Promise<string> =>
  renderToString(h(Chart<Row>, { data: DATA, x: 'm', width: 300, height: 200, title: 'Sales', animate: false }, h(Bar<Row>, { y: 'v', label: 'Sales' }), h(Axis, { y: true, inverse })))

const frame = (s: string): string => /<div data-pyreon-chart-frame=""[^>]*>(<svg[\s\S]*?<\/svg>)<\/div>/.exec(s)![1]!
const barTops = (svg: string): number[] => [...svg.matchAll(/<path d="M[\d.]+ ([\d.]+)[^>]*fill="#4f7df3"/g)].map((m) => Number(m[1]))

describe('server-rendered yInverse', () => {
  it('the first frame is the flipped chart', async () => {
    require('node:fs').writeFileSync('/tmp/frame.txt', frame(await html(true)))
    const plain = frame(await html(false))
    const inv = frame(await html(true))
    expect(inv).not.toBe(plain)
    // both bars are anchored at the top edge once inverted
    const tops = barTops(inv)
    expect(tops.length).toBeGreaterThan(0)
    expect(new Set(tops.map((t) => Math.round(t))).size).toBe(1)
    expect(new Set(barTops(plain).map((t) => Math.round(t))).size).toBeGreaterThan(1)
  })
  it('the table rows are in data order either way', async () => {
    const out = await html(true)
    expect(out).toContain('<tr><th scope="row">Jan</th><td>1,200</td></tr>')
    expect(out.indexOf('Jan')).toBeLessThan(out.indexOf('Feb'))
  })
})
