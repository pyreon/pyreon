// @vitest-environment node
// Bar thickness and per-datum colour in the SERVER HTML: the first frame is the
// same draw list the canvas paints, and the accessible table carries the
// shade values, so neither option exists only after hydration.
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { Bar, Chart } from './grammar'
import { fillBy, shadeBy } from './item-colors'
// Registers the first-frame serializer, as a server entry does.
import '../svg'

interface Row { m: string; v: number; w: number; tone: string }
const DATA: Row[] = [{ m: 'Jan', v: 1200, w: 5, tone: '#e11d48' }, { m: 'Feb', v: 3400, w: 9, tone: '#0891b2' }]
const frame = (html: string): string => /<div data-pyreon-chart-frame=""[^>]*>(<svg[\s\S]*?<\/svg>)<\/div>/.exec(html)![1]!

describe('server-rendered cartesian basics', () => {
  it('barWidth reaches the first-frame SVG (the bars are narrower than the default band share)', async () => {
    const wide = frame(await renderToString(h(Chart<Row>, { data: DATA, x: 'm', width: 300, height: 200, animate: false }, h(Bar<Row>, { y: 'v' }))))
    const thin = frame(await renderToString(h(Chart<Row>, { data: DATA, x: 'm', width: 300, height: 200, animate: false, barWidth: 10 }, h(Bar<Row>, { y: 'v' }))))
    expect(wide).not.toBe(thin)
    // Rounded bars draw as paths; the thin chart's path spans 10px horizontally.
    const spans = (svg: string): number[] =>
      [...svg.matchAll(/<path [^>]*fill="#4f7df3"[^>]*d="([^"]+)"/g)].map((m) => {
        const xs = [...m[1]!.matchAll(/[ML]\s*([\d.]+)[ ,]/g)].map((n) => Number(n[1]))
        return Math.max(...xs) - Math.min(...xs)
      })
    expect(Math.max(...spans(thin))).toBeLessThanOrEqual(10.01)
    expect(Math.min(...spans(wide))).toBeGreaterThan(30)
  })

  it('fill={fillBy(...)} paints each bar in its colour in the first frame', async () => {
    const svg = frame(await renderToString(h(Chart<Row>, { data: DATA, x: 'm', width: 300, height: 200, animate: false }, h(Bar<Row>, { y: 'v', fill: fillBy<Row>('tone') }))))
    expect(svg).toContain('#e11d48')
    expect(svg).toContain('#0891b2')
    expect(svg).not.toContain('#4f7df3"')
  })

  it('the shade values are in the server HTML table, beside the bar values', async () => {
    const html = await renderToString(h(Chart<Row>, { data: DATA, x: 'm', width: 300, height: 200, title: 'Sales' }, h(Bar<Row>, { y: 'v', label: 'Revenue', fill: shadeBy<Row>('w') })))
    expect(html).toContain('<th scope="col">Revenue (shade)</th>')
    expect(html).toContain('<tr><th scope="row">Jan</th><td>1,200</td><td>5</td></tr>')
  })
})
