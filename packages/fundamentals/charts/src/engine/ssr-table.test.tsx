// @vitest-environment node
// The accessible table is in the SERVER HTML: a crawler, a no-JS reader, or
// anyone before hydration gets the chart's numbers, not an empty <table>.
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { tableHtml } from './canvas-host'
import { Bar, Chart } from './grammar'
// Registers the first-frame serializer, as a server entry does.
import '../svg'

describe('server-rendered chart data', () => {
  it('ships the table rows, caption and headers in the HTML', async () => {
    const html = await renderToString(
      h(Chart<{ m: string; v: number }>, { data: [{ m: 'Jan', v: 1200 }, { m: 'Feb', v: 3400 }], x: 'm', width: 300, height: 200, title: 'Revenue' }, h(Bar, { y: 'v', label: 'Sales' })),
    )
    expect(html).toContain('<caption>Revenue</caption>')
    expect(html).toContain('<th scope="col">Sales</th>')
    expect(html).toContain('<tr><th scope="row">Jan</th><td>1,200</td></tr>')
    expect(html).toContain('<th scope="row">Feb</th><td>3,400</td>')
  })

  it('ships the first frame as an SVG, so the chart is visible before any script runs', async () => {
    const html = await renderToString(
      h(Chart<{ m: string; v: number }>, { data: [{ m: 'Jan', v: 1200 }, { m: 'Feb', v: 3400 }], x: 'm', width: 300, height: 200, title: 'Revenue', animate: false }, h(Bar, { y: 'v', label: 'Sales' })),
    )
    const frame = /<div data-pyreon-chart-frame=""[^>]*>(<svg[\s\S]*?<\/svg>)<\/div>/.exec(html)
    expect(frame, 'no first-frame SVG in the server HTML').not.toBeNull()
    const svg = frame![1]!
    // Two bars (rounded corners draw as paths in the series colour) and the
    // category labels, as the canvas would draw them.
    expect((svg.match(/<path [^>]*fill="#4f7df3"/g) ?? []).length).toBe(2)
    expect(svg).toContain('>Jan<')
    expect(svg).toContain('>Feb<')
    expect(svg).toContain('width="300"')
  })

  it('a chart with no width scales its first frame to the container', async () => {
    const html = await renderToString(h(Chart<{ m: string; v: number }>, { data: [{ m: 'a', v: 1 }], x: 'm', height: 150 }, h(Bar, { y: 'v' })))
    expect(html).toMatch(/<svg[^>]*width="100%"/)
  })

  it('escapes cell text', () => {
    const out = tableHtml({ headers: ['<b>'], rows: [['a&b', '"x"']], total: 1 }, 'T<')
    expect(out).toContain('<caption>T&lt;</caption>')
    expect(out).toContain('<th scope="col">&lt;b&gt;</th>')
    expect(out).toContain('<th scope="row">a&amp;b</th><td>&quot;x&quot;</td>')
  })
})
