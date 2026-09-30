// @vitest-environment node
// Every canvas-hosted family (pie, treemap, funnel, sankey, …) ships its first
// frame as SVG on the server, like `<Chart>`: an SSR / SSG page shows the
// chart before any script runs. The frame is the same draw list the canvas
// paints at its final state — colours, labels, title and legend included.
import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { FunnelChart } from './FunnelChart'
import { PieChart } from './PieChart'
import { SankeyChart } from './SankeyChart'
import { TreemapChart } from './TreemapChart'
// Registers the first-frame serializer, as a server entry does.
import '../svg'

interface Row { name: string; v: number; c: string }
const ROWS: Row[] = [
  { name: 'Alpha', v: 5, c: '#aa1111' },
  { name: 'Beta', v: 3, c: '#11aa11' },
  { name: 'Gamma', v: 2, c: '#1111aa' },
]

const frameOf = (html: string): string | null => /<div data-pyreon-chart-frame=""[^>]*>(<svg[\s\S]*?<\/svg>)<\/div>/.exec(html)?.[1] ?? null

describe('canvas-hosted families ship a first-frame SVG from the server', () => {
  const cases: [string, VNode, string[]][] = [
    ['pie', h(PieChart<Row>, { data: ROWS, value: (d) => d.v, label: (d) => d.name, color: (d) => d.c, width: 300, height: 200 }), ['#aa1111', '#11aa11', '#1111aa']],
    ['funnel', h(FunnelChart<Row>, { data: ROWS, value: (d) => d.v, label: (d) => d.name, color: (d) => d.c, width: 300, height: 200 }), ['#aa1111', '#11aa11', '#1111aa', 'Alpha']],
    ['treemap', h(TreemapChart, { data: ROWS.map((r) => ({ name: r.name, value: r.v, color: r.c })), width: 300, height: 200 }), ['#aa1111', '#11aa11', '#1111aa', 'Alpha']],
    ['sankey', h(SankeyChart, { nodes: [{ name: 'In', color: '#aa1111' }, { name: 'Out', color: '#11aa11' }], links: [{ source: 'In', target: 'Out', value: 4 }], width: 300, height: 200 }), ['#aa1111', '#11aa11', 'In', 'Out']],
  ]
  for (const [name, node, marks] of cases) {
    it(`${name}: the frame draws the data`, async () => {
      const svg = frameOf(await renderToString(node))
      expect(svg, `no first-frame SVG for ${name}`).not.toBeNull()
      for (const m of marks) expect(svg!, `${name} frame is missing ${m}`).toContain(m)
    })
  }

  it('the chrome is in the frame too: a shown title is drawn', async () => {
    const svg = frameOf(await renderToString(h(PieChart<Row>, { data: ROWS, value: (d) => d.v, label: (d) => d.name, width: 300, height: 200, title: 'Share by region', showTitle: true })))
    expect(svg).toContain('Share by region')
  })

  it('an RTL chart ships its mirrored frame', async () => {
    const node = (rtl: boolean) => h(FunnelChart<Row>, { data: ROWS, value: (d) => d.v, label: (d) => d.name, color: (d) => d.c, width: 300, height: 200, rtl, funnel: { align: 'left' } })
    expect(frameOf(await renderToString(node(true)))).not.toEqual(frameOf(await renderToString(node(false))))
  })

  it('a family with no width scales its frame to the container', async () => {
    const svg = frameOf(await renderToString(h(PieChart<Row>, { data: ROWS, value: (d) => d.v, label: (d) => d.name, height: 200 })))
    expect(svg).toMatch(/^<svg[^>]*width="100%"/)
  })
})
