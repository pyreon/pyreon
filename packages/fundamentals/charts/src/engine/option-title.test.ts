import { describe, expect, it } from 'vitest'
import { optionTitleCommands, readOptionTitle } from './option-title'
import { compileOption, compiledCommands } from './option'
import { GRID_PART_KEY } from './option-grid'
import type { ChartTheme } from './render'

// The placement itself is held against ECharts' SSR output in echarts-differential;
// these pin the reading, the styling and the reserved height.
const t = { fontSize: 12, text: '#111111', label: '#666666' } as ChartTheme
const measure = (s: string, size: number): number => s.length * size * 0.5
type TextCmd = { kind: 'text'; text: string; at: { x: number; y: number }; fill: string; size: number; align: string; baseline: string; weight?: string }
const run = (title: Record<string, unknown>, width = 400, height = 300) => optionTitleCommands(readOptionTitle(title)!, width, height, t, measure)
const texts = (title: Record<string, unknown>): TextCmd[] => run(title).cmds.filter((c) => c.kind === 'text') as TextCmd[]

describe('option title', () => {
  it('no text, show false, or not an object: no title', () => {
    expect(readOptionTitle(undefined)).toBeNull()
    expect(readOptionTitle({ subtext: 'x' })).toBeNull()
    expect(readOptionTitle({ text: 'T', show: false })).toBeNull()
  })

  it('ECharts 6 defaults: centred, 15 from the top in a 5px padding, 18px bold over a 12px subtext 10px below', () => {
    const [a, b] = texts({ text: 'T', subtext: 'S' })
    expect(a).toMatchObject({ text: 'T', at: { x: 200, y: 20 }, size: 18, weight: 'bold', fill: '#111111', align: 'middle', baseline: 'top' })
    expect(b).toMatchObject({ text: 'S', at: { x: 200, y: 48 }, size: 12, fill: '#666666', align: 'middle' })
    expect(b!.weight).toBeUndefined()
    // The plot below leaves the block and its bottom padding: 20 + 18 + 10 + 12 + 5.
    expect(run({ text: 'T', subtext: 'S' }).height).toBe(65)
  })

  it('left / right place the block\'s edge; a keyword also aligns its text', () => {
    expect(texts({ text: 'T', left: 'right' })[0]).toMatchObject({ at: { x: 395 }, align: 'end' })
    expect(texts({ text: 'T', left: 30 })[0]).toMatchObject({ at: { x: 35 }, align: 'start' })
    expect(texts({ text: 'T', left: '25%' })[0]).toMatchObject({ at: { x: 105 } })
    // right in pixels: the block ends there, its text still left-aligned (ECharts).
    expect(texts({ text: 'TT', right: 20 })[0]).toMatchObject({ at: { x: 400 - 20 - 5 - 18 }, align: 'start' })
  })

  it('top / bottom / middle, and a bottom title reserves nothing above the plot', () => {
    expect(texts({ text: 'T', top: 40 })[0]).toMatchObject({ at: { y: 45 }, baseline: 'top' })
    expect(texts({ text: 'T', top: 'bottom' })[0]).toMatchObject({ at: { y: 295 }, baseline: 'bottom' })
    expect(texts({ text: 'T', top: 'middle' })[0]).toMatchObject({ at: { y: 150 }, baseline: 'middle' })
    expect(run({ text: 'T', top: 'bottom' }).height).toBe(0)
    expect(run({ text: 'T', bottom: 10 }).height).toBe(0)
  })

  it('textAlign / textVerticalAlign override; textStyle, subtextStyle, itemGap and padding style the block', () => {
    expect(texts({ text: 'T', left: 'center', textAlign: 'left' })[0]!.align).toBe('start')
    expect(texts({ text: 'T', textAlign: 'right' })[0]!.align).toBe('end')
    expect(texts({ text: 'T', textVerticalAlign: 'bottom' })[0]!.baseline).toBe('bottom')
    const [a, b] = texts({ text: 'T', subtext: 'S', itemGap: 4, padding: [2, 8], textStyle: { color: '#f00', fontSize: 20, fontWeight: 'normal' }, subtextStyle: { color: '#0f0', fontSize: 9, fontWeight: 700 } })
    expect(a).toMatchObject({ fill: '#f00', size: 20, at: { y: 17 } })
    expect(a!.weight).toBeUndefined()
    expect(b).toMatchObject({ fill: '#0f0', size: 9, weight: 'bold', at: { y: 17 + 20 + 4 } })
  })

  it('a background and border draw a box round the block and its padding', () => {
    const cmds = run({ text: 'TT', left: 0, top: 0, backgroundColor: '#eee', borderWidth: 1, borderColor: '#999' }).cmds
    expect(cmds[0]).toMatchObject({ kind: 'rect', fill: '#eee', rect: { x: 0, y: 0, w: 18 + 10, h: 18 + 10 } })
    expect(cmds[1]).toMatchObject({ kind: 'polyline', stroke: '#999', width: 1 })
    expect(run({ text: 'T', backgroundColor: 'transparent' }).cmds.every((c) => c.kind === 'text')).toBe(true)
  })

  it('link / sublink: each linked line reports the box it was drawn in and the window it opens', () => {
    const { links } = run({ text: 'TT', subtext: 'SSSS', link: 'https://a.test', sublink: 'https://b.test', subtarget: 'self' })
    // 'TT' at 18px measures 18 wide, centred on 200; 'SSSS' at 12px measures 24.
    expect(links).toEqual([
      { rect: { x: 191, y: 20, w: 18, h: 18 }, url: 'https://a.test', target: '_blank' },
      { rect: { x: 188, y: 48, w: 24, h: 12 }, url: 'https://b.test', target: '_self' },
    ])
    expect(run({ text: 'T' }).links).toEqual([])
  })

  it('several titles all draw; the plot below leaves room for the lowest at the top', () => {
    // Laid out by its labels (a multi-grid part), the plot leaves room; ECharts' single grid lets titles overlay its margin.
    const option = { grid: { [GRID_PART_KEY]: true }, title: [{ text: 'One', left: 10 }, { text: 'Two', subtext: 'sub', right: 10 }, { text: 'Low', top: 'bottom' }], xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] }
    const c = compileOption(option)
    expect(c.titles.map((x) => x.text)).toEqual(['One', 'Two', 'Low'])
    expect(c.title?.text).toBe('One')
    const out = compiledCommands(c, option, () => 10)
    const drawn = out.cmds.filter((x) => x.kind === 'text').map((x) => (x as TextCmd).text)
    expect(drawn).toEqual(expect.arrayContaining(['One', 'Two', 'sub', 'Low']))
    expect(out.top).toBe(65)
  })

  it('the option path draws it: the default title lands mid-chart', () => {
    const c = compileOption({ title: { text: 'Mid' }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] })
    const cmd = compiledCommands(c, {}, () => 10).cmds.find((x) => x.kind === 'text' && (x as TextCmd).text === 'Mid') as TextCmd
    expect(cmd.align).toBe('middle')
    expect(cmd.at.x).toBe(c.spec.width / 2)
  })
})
