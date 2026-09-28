// @vitest-environment node
// The accessible table is in the SERVER HTML: a crawler, a no-JS reader, or
// anyone before hydration gets the chart's numbers, not an empty <table>.
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { tableHtml } from './canvas-host'
import { Bar, Chart } from './grammar'

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

  it('escapes cell text', () => {
    const out = tableHtml({ headers: ['<b>'], rows: [['a&b', '"x"']], total: 1 }, 'T<')
    expect(out).toContain('<caption>T&lt;</caption>')
    expect(out).toContain('<th scope="col">&lt;b&gt;</th>')
    expect(out).toContain('<th scope="row">a&amp;b</th><td>&quot;x&quot;</td>')
  })
})
