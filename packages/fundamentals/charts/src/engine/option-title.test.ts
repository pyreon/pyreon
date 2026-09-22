import { describe, expect, it } from 'vitest'
import { optionTitleCommands, readOptionTitle } from './option-title'
import { compileOption, compiledCommands } from './option'
import type { ChartTheme } from './render'

const t = { fontSize: 12, label: '#666666' } as ChartTheme
type TextCmd = { kind: 'text'; text: string; at: { x: number; y: number }; fill: string; size: number; align: string }
const texts = (title: Record<string, unknown>, width = 400): TextCmd[] => optionTitleCommands(readOptionTitle(title)!, width, t).cmds as TextCmd[]

describe('option title', () => {
  it('no text, show false, or not an object: no title', () => {
    expect(readOptionTitle(undefined)).toBeNull()
    expect(readOptionTitle({ subtext: 'x' })).toBeNull()
    expect(readOptionTitle({ text: 'T', show: false })).toBeNull()
  })
  it('defaults: left-aligned at 0, a step larger than the theme font, subtext 2px under it', () => {
    const [a, b] = texts({ text: 'T', subtext: 'S' })
    expect(a).toMatchObject({ text: 'T', at: { x: 0, y: 0 }, size: 16, fill: '#666666', align: 'start' })
    expect(b).toMatchObject({ text: 'S', at: { x: 0, y: 18 }, size: 12, align: 'start' })
    expect(optionTitleCommands(readOptionTitle({ text: 'T', subtext: 'S' })!, 400, t).height).toBe(38)
  })
  it('left: center / right / pixels / percent; right alone hangs from the right', () => {
    expect(texts({ text: 'T', left: 'center' })[0]).toMatchObject({ at: { x: 200 }, align: 'middle' })
    expect(texts({ text: 'T', left: 'right' })[0]).toMatchObject({ at: { x: 400 }, align: 'end' })
    expect(texts({ text: 'T', left: 30 })[0]).toMatchObject({ at: { x: 30 }, align: 'start' })
    expect(texts({ text: 'T', left: '25%' })[0]).toMatchObject({ at: { x: 100 } })
    expect(texts({ text: 'T', left: 'bogus' })[0]).toMatchObject({ at: { x: 0 } })
    expect(texts({ text: 'T', right: 20 })[0]).toMatchObject({ at: { x: 380 }, align: 'end' })
    expect(texts({ text: 'T', right: '10%' })[0]).toMatchObject({ at: { x: 360 } })
  })
  it('textAlign overrides the hang; textStyle, subtextStyle and itemGap style the block', () => {
    expect(texts({ text: 'T', left: 'center', textAlign: 'left' })[0]!.align).toBe('start')
    expect(texts({ text: 'T', textAlign: 'center' })[0]!.align).toBe('middle')
    expect(texts({ text: 'T', textAlign: 'right' })[0]!.align).toBe('end')
    const [a, b] = texts({ text: 'T', subtext: 'S', itemGap: 10, textStyle: { color: '#f00', fontSize: 20 }, subtextStyle: { color: '#0f0', fontSize: 9 } })
    expect(a).toMatchObject({ fill: '#f00', size: 20 })
    expect(b).toMatchObject({ fill: '#0f0', size: 9, at: { y: 30 } })
  })
  it('the option path draws it: a centred title lands mid-chart', () => {
    const c = compileOption({ title: { text: 'Mid', left: 'center' }, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'bar', data: [1] }] })
    const cmd = compiledCommands(c, {}, () => 10).cmds.find((x) => x.kind === 'text' && (x as TextCmd).text === 'Mid') as TextCmd
    expect(cmd.align).toBe('middle')
    expect(cmd.at.x).toBe(c.spec.width / 2)
  })
})
