// The hosts render on the server: a canvas the client paints into, the
// accessible table with the numbers, no browser API touched at render time.
// (The doc's "pure-string SVG" claim is about `chartToSvg` and the family
// `*ToSvg` serializers; the COMPONENTS ship a canvas that the client fills.)
import { describe, expect, it } from 'vitest'
import { renderToString } from '@pyreon/runtime-server'
import { h } from '@pyreon/core'
import { PlotChart } from './Chart'
import { GaugeChart, PieChart } from './PieChart'
import { TreemapChart } from './TreemapChart'
import { SankeyChart } from './SankeyChart'
import { Bar, Plot } from './grammar'
import { bars, line } from './marks'

interface Row {
  m: string
  v: number
}

describe('server render of the hosts', () => {
  it('<PlotChart> renders a canvas, a live region and the data table without touching the DOM', async () => {
    const html = await renderToString(
      // A component wrapper keeps the host inside a setup frame (its theme context read) without `h`'s generic-inference gap.
      h(() => PlotChart<Row>({ data: [{ m: 'a', v: 1 }, { m: 'b', v: 2 }], x: (d) => d.m, marks: [bars((d) => d.v), line((d) => d.v)], title: 'Sales', tooltip: true, dataZoom: true, navigator: true }), null),
    )
    expect(html).toContain('<canvas')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-describedby')
    expect(html).toContain('<caption>Sales</caption>')
    expect(html).toContain('<td>2</td>')
    expect(html).toContain('aria-live="polite"')
  })

  it('every family host renders on the server too (the shared host, the gauge included)', async () => {
    for (const node of [
      h(() => PieChart<{ n: string; v: number }>({ data: [{ n: 'x', v: 1 }], value: (d) => d.v, label: (d) => d.n, showLegend: true, legendPosition: 'right' }), null),
      h(GaugeChart, { value: 5, title: 'Load' }),
      h(TreemapChart, { data: [{ name: 'a', value: 1 }], toolbox: { saveAsImage: true } }),
      h(SankeyChart, { nodes: [{ name: 'a' }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 1 }] }),
    ]) {
      const html = await renderToString(node)
      expect(html).toContain('<canvas')
      expect(html).toContain('<table')
    }
  })

  it('the <Plot> grammar renders on the server', async () => {
    const html = await renderToString(h(() => Plot<Row>({ data: [{ m: 'a', v: 1 }], x: 'm', children: h(Bar<Row>, { y: 'v' }) }), null))
    expect(html).toContain('<canvas')
    expect(html).toContain('<td>1</td>')
  })
})
