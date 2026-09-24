// The ECharts treemap's colouring and painting — what echarts-differential's
// layout cases do not pin: which colour a node takes, and what gets drawn.
import { describe, expect, it } from 'vitest'
import { readTreemapEc } from './option-treemap'
import { renderTreemapEc, treemapEcCells, treemapGround } from './treemap'

const BOX = { x: 20, y: 50, w: 360, h: 200 }
const PALETTE = ['#p0', '#p1', '#p2']
const data = [
  { name: 'A', children: [{ name: 'a1', value: 4, children: [{ name: 'deep', value: 4 }] }, { name: 'a2', value: 2, itemStyle: { color: '#own' }, children: [{ name: 'a2x', value: 2 }] }] },
  { name: 'B', value: 3 },
]
const read = (series: object = {}) => readTreemapEc({ type: 'treemap', ...series }, data)

describe('treemap colours', () => {
  it('a top-level node takes the palette by its index; every descendant inherits, at any depth', () => {
    const ec = read()
    const cells = treemapEcCells(ec.root, BOX, ec.cfg, PALETTE)
    const color = (name: string) => cells.find((c) => c.name === name)!.color
    expect(color('A')).toBe('#p0')
    expect(color('B')).toBe('#p1')
    expect(color('a1')).toBe('#p0')
    expect(color('deep')).toBe('#p0')
    // An own colour overrides, and passes down.
    expect(color('a2')).toBe('#own')
    expect(color('a2x')).toBe('#own')
  })
  it('depth counts from the top level, the series root dropped', () => {
    const ec = read()
    const cells = treemapEcCells(ec.root, BOX, ec.cfg, PALETTE)
    expect(cells.find((c) => c.name === 'A')!.depth).toBe(0)
    expect(cells.find((c) => c.name === 'deep')!.depth).toBe(2)
    expect(cells.some((c) => c.name === '')).toBe(false)
  })
})

describe('treemap painting', () => {
  const measure = (t: string, size: number) => t.length * size * 0.6
  it('draws the box and every parent in the ground colour, and each leaf in its own', () => {
    const ec = read()
    const cells = treemapEcCells(ec.root, BOX, ec.cfg, PALETTE)
    const cmds = renderTreemapEc(cells, BOX, '#fff', '#ffffff', 12, true, 1, measure)
    const rects = cmds.filter((c) => c.kind === 'rect')
    expect(rects[0]).toMatchObject({ rect: BOX, fill: '#fff' })
    // One rect per cell after the box, in cell order (a parent with one child shares its rect).
    expect(rects).toHaveLength(cells.length + 1)
    cells.forEach((c, k) => expect(rects[k + 1]).toMatchObject({ rect: c.rect, fill: c.leaf ? c.color : '#fff' }))
  })
  it('labels a leaf at its centre, and truncates a name wider than the cell', () => {
    const ec = readTreemapEc({ type: 'treemap' }, [{ name: 'Short', value: 9 }, { name: 'A very long name indeed', value: 1 }])
    const cells = treemapEcCells(ec.root, BOX, ec.cfg, PALETTE)
    const texts = renderTreemapEc(cells, BOX, '#fff', '#ffffff', 12, true, 1, measure).filter((c) => c.kind === 'text')
    const short = cells.find((c) => c.name === 'Short')!
    expect(texts[0]).toMatchObject({ text: 'Short', at: { x: short.rect.x + short.rect.w / 2, y: short.rect.y + short.rect.h / 2 }, align: 'middle', baseline: 'middle' })
    expect(texts.every((t) => t.kind !== 'text' || measure(t.text, 12) <= cells.find((c) => c.rect.x + c.rect.w / 2 === t.at.x)!.rect.w)).toBe(true)
    expect(texts.some((t) => t.kind === 'text' && t.text.endsWith('...'))).toBe(true)
  })
  it('labels wait for the entrance; label.show false draws none', () => {
    const ec = read()
    const cells = treemapEcCells(ec.root, BOX, ec.cfg, PALETTE)
    expect(renderTreemapEc(cells, BOX, '#fff', '#fff', 12, true, 0.5, measure).some((c) => c.kind === 'text')).toBe(false)
    expect(renderTreemapEc(cells, BOX, '#fff', '#fff', 12, false, 1, measure).some((c) => c.kind === 'text')).toBe(false)
  })
  it('the ground is borderColor, else the chart background, else white', () => {
    expect(treemapGround('#123', '#000')).toBe('#123')
    expect(treemapGround('', '#000')).toBe('#000')
    expect(treemapGround('', '')).toBe('#ffffff')
  })
})
