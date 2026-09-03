import { describe, expect, it } from 'vitest'
import { layoutSankey, renderSankey, ribbonPoints } from './sankey'
import { hitSankey } from './sankey-hit'
import { sankeyToSvg } from './family-svg'
import { compileFamily, familyToSvg } from './option-family'

const box = { x: 0, y: 0, w: 400, h: 200 }
const nodes = [{ name: 'coal' }, { name: 'gas' }, { name: 'power' }, { name: 'homes' }, { name: 'industry' }]
const links = [
  { source: 'coal', target: 'power', value: 30 },
  { source: 'gas', target: 'power', value: 10 },
  { source: 'power', target: 'homes', value: 25 },
  { source: 'power', target: 'industry', value: 15 },
]

describe('sankey layout', () => {
  it('columns by longest path, node value = max(in, out), bands proportional at one scale', () => {
    const l = layoutSankey(nodes, links, box)
    const by = (n: string) => l.nodes.find((x) => x.name === n)!
    expect(by('coal').depth).toBe(0)
    expect(by('power').depth).toBe(1)
    expect(by('homes').depth).toBe(2)
    expect(by('power').value).toBe(40)
    expect(by('coal').rect.h / by('gas').rect.h).toBeCloseTo(3, 9)
    expect(by('power').rect.h).toBeCloseTo(by('coal').rect.h + by('gas').rect.h, 9)
    expect(by('coal').rect.x).toBe(0)
    expect(by('homes').rect.x + by('homes').rect.w).toBeCloseTo(400, 9)
    expect(l.dropped).toEqual([])
  })
  it('the tallest column fills the height and siblings never overlap', () => {
    const l = layoutSankey(nodes, links, box, { nodePadding: 10 })
    const col0 = l.nodes.filter((n) => n.depth === 0).sort((a, b) => a.rect.y - b.rect.y)
    expect(col0[1]!.rect.y).toBeGreaterThanOrEqual(col0[0]!.rect.y + col0[0]!.rect.h + 10 - 1e-9)
    const power = l.nodes.find((n) => n.name === 'power')!
    expect(power.rect.y).toBeGreaterThanOrEqual(0)
    expect(power.rect.y + power.rect.h).toBeLessThanOrEqual(200 + 1e-9)
    for (const n of l.nodes) expect(n.rect.h).toBeGreaterThan(0)
  })
  it('ribbons are stacked without crossing at a node, widths match values', () => {
    const l = layoutSankey(nodes, links, box)
    const power = l.nodes.find((n) => n.name === 'power')!
    const outs = l.links.filter((k) => k.source === power.index).sort((a, b) => a.y0 - b.y0)
    expect(outs[1]!.y0).toBeCloseTo(outs[0]!.y0 + outs[0]!.width, 9)
    expect(outs[0]!.y0).toBeCloseTo(power.rect.y, 9)
    const ins = l.links.filter((k) => k.target === power.index)
    expect(ins.reduce((s, k) => s + k.width, 0)).toBeCloseTo(power.rect.h, 9)
    const homes = l.links.find((k) => k.target === l.nodes.find((n) => n.name === 'homes')!.index)!
    const industry = l.links.find((k) => k.target === l.nodes.find((n) => n.name === 'industry')!.index)!
    expect(homes.width / industry.width).toBeCloseTo(25 / 15, 9)
  })
  it('drops unknown endpoints, self-loops, zero values and cycle back-edges — and says which', () => {
    const l = layoutSankey(
      [{ name: 'a' }, { name: 'b' }],
      [
        { source: 'a', target: 'b', value: 5 },
        { source: 'b', target: 'a', value: 2 },
        { source: 'a', target: 'zzz', value: 1 },
        { source: 'a', target: 'a', value: 1 },
        { source: 'a', target: 'b', value: 0 },
      ],
      box,
    )
    expect(l.links).toHaveLength(1)
    expect(l.dropped).toHaveLength(4)
    expect(l.dropped.some((d) => d.includes('cycle'))).toBe(true)
  })
  it('align:left keeps a sink at its natural column; justify pushes it to the last', () => {
    const n2 = [{ name: 's' }, { name: 'early' }, { name: 'mid' }, { name: 'end' }]
    const l2 = [
      { source: 's', target: 'early', value: 1 },
      { source: 's', target: 'mid', value: 1 },
      { source: 'mid', target: 'end', value: 1 },
    ]
    const just = layoutSankey(n2, l2, box).nodes.find((n) => n.name === 'early')!
    const left = layoutSankey(n2, l2, box, { align: 'left' }).nodes.find((n) => n.name === 'early')!
    expect(just.depth).toBe(2)
    expect(left.depth).toBe(1)
  })
  it('ribbon points close a band; entrance grows from the source', () => {
    const l = layoutSankey(nodes, links, box)
    const link = l.links[0]!
    const pts = ribbonPoints(l, link)
    expect(pts).toHaveLength(34)
    expect(pts[0]!.x).toBeCloseTo(l.nodes[link.source]!.rect.x + l.nodes[link.source]!.rect.w, 9)
    expect(pts[16]!.x).toBeCloseTo(l.nodes[link.target]!.rect.x, 9)
    const half = ribbonPoints(l, link, 0.5)
    expect(half[16]!.x).toBeLessThan(pts[16]!.x)
  })
  it('renders ribbons, bands and labels (last column labels sit left of the node)', () => {
    const l = layoutSankey(nodes, links, box)
    const cmds = renderSankey(l)
    expect(cmds.filter((c) => c.kind === 'polygon')).toHaveLength(4)
    expect(cmds.filter((c) => c.kind === 'rect')).toHaveLength(5)
    const labels = cmds.filter((c) => c.kind === 'text')
    expect(labels).toHaveLength(5)
    const homes = labels.find((c) => c.kind === 'text' && c.text === 'homes')!
    if (homes.kind !== 'text') throw new Error('text')
    expect(homes.align).toBe('end')
    expect(renderSankey(l, { progress: 0.3 }).filter((c) => c.kind === 'text')).toHaveLength(0)
  })
  it('hit-testing prefers a node band, then a ribbon, then null', () => {
    const l = layoutSankey(nodes, links, box)
    const coal = l.nodes.find((n) => n.name === 'coal')!
    const hn = hitSankey(l, coal.rect.x + 2, coal.rect.y + coal.rect.h / 2)
    expect(hn?.kind).toBe('node')
    const link = l.links.find((k) => k.source === coal.index)!
    const mid = ribbonPoints(l, link)[8]!
    const hl = hitSankey(l, mid.x, mid.y + link.width / 2)
    expect(hl?.kind).toBe('link')
    expect(hitSankey(l, -5, -5)).toBeNull()
  })
  it('sankeyToSvg renders and describes', () => {
    const svg = sankeyToSvg({ nodes, links, title: 'Energy' })
    expect(svg).toContain('<polygon')
    expect(svg).toContain('4 flows totalling 80')
    expect(svg).not.toContain('NaN')
  })
})

describe('sankey option mapping', () => {
  it('ECharts sankey series lowers nodes/links, nodeWidth/nodeGap/nodeAlign/layoutIterations', () => {
    const f = compileFamily({
      series: [{ type: 'sankey', nodeWidth: 20, nodeGap: 12, nodeAlign: 'left', layoutIterations: 0, data: [{ name: 'a', itemStyle: { color: '#123456' } }, { name: 'b' }], links: [{ source: 'a', target: 'b', value: 3 }] }],
    })!
    if (f.plan.kind !== 'sankey') throw new Error('kind')
    expect(f.plan.nodes[0]!.color).toBe('#123456')
    expect(f.plan.links[0]!.value).toBe(3)
    expect(f.plan.sankey.nodeWidth).toBe(20)
    expect(f.plan.sankey.nodePadding).toBe(12)
    expect(f.plan.sankey.align).toBe('left')
    expect(f.plan.sankey.iterations).toBe(0)
    expect(f.warnings).toEqual([])
    expect(familyToSvg(f.plan)).toContain('<polygon')
    const vertical = compileFamily({ series: [{ type: 'sankey', orient: 'vertical', data: [{ name: 'a' }], links: [] }] })!
    expect(vertical.warnings.map((w) => w.code)).toContain('series-option-unsupported')
  })
})
