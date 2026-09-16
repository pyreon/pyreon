import { describe, expect, it } from 'vitest'
import { labelCommands, labelLines } from './labels'
import { compileOption } from './option'
import { defaultTheme, renderChart } from './render'
import type { DrawCmd, MeasureText } from './types'

/**
 * ECharts' series `label` — its formatter template, its colours and sizes, and
 * its rich text. The facade resolves the template (it knows the series name,
 * the category and the share); the engine owns the segmentation and layout.
 */
const measure: MeasureText = (text, size) => text.length * size * 0.6
const texts = (cmds: DrawCmd[]) => cmds.filter((c): c is Extract<DrawCmd, { kind: 'text' }> => c.kind === 'text')
const base = { xAxis: { type: 'category', data: ['Mon', 'Tue'] }, yAxis: {} }

describe('label segmentation', () => {
  it('splits lines on \\n and takes a named rich style, falling back for an unknown name', () => {
    const rich = [{ name: 'hi', color: '#f00', fontSize: 20 }]
    const lines = labelLines('a{hi|B}c\nd{nope|E}', rich, '#111', 12)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual([
      { text: 'a', color: '#111', fontSize: 12 },
      { text: 'B', color: '#f00', fontSize: 20 },
      { text: 'c', color: '#111', fontSize: 12 },
    ])
    // An unknown style still SHOWS its text, in the label's own style.
    expect(lines[1]).toEqual([
      { text: 'd', color: '#111', fontSize: 12 },
      { text: 'E', color: '#111', fontSize: 12 },
    ])
    // An unclosed brace is literal text, not a dropped segment.
    expect(labelLines('100{', [], '#111', 12)[0]).toEqual([{ text: '100{', color: '#111', fontSize: 12 }])
  })

  it('a plain label is ONE command anchored as asked; a rich one is a command per segment, laid out about the anchor', () => {
    const plain = labelCommands('42', [], { x: 50, y: 20 }, 'middle', 'bottom', '#111', 12, measure)
    expect(plain).toHaveLength(1)
    expect(plain[0]).toMatchObject({ kind: 'text', text: '42', at: { x: 50, y: 20 }, align: 'middle', baseline: 'bottom', fill: '#111', size: 12 })

    const rich = texts(labelCommands('{k|A}B', [{ name: 'k', color: '#0f0', fontSize: 24 }], { x: 100, y: 40 }, 'middle', 'middle', '#111', 12, measure))
    expect(rich).toHaveLength(2)
    expect(rich[0]!.fill).toBe('#0f0')
    expect(rich[0]!.size).toBe(24)
    expect(rich[1]!.fill).toBe('#111')
    // Laid out left to right, and the block is centred on the anchor.
    expect(rich[1]!.at.x).toBeGreaterThan(rich[0]!.at.x)
    expect(rich[0]!.at.x).toBeLessThan(100)
    // The tallest segment sets the line height, so a 24pt segment lifts the block.
    expect(rich[0]!.at.y).toBeLessThan(40)
  })

  it('two lines stack downward and each honours the alignment', () => {
    const cmds = texts(labelCommands('ab\ncd', [], { x: 0, y: 0 }, 'end', 'top', '#111', 10, measure))
    expect(cmds).toHaveLength(2)
    expect(cmds[1]!.at.y).toBeGreaterThan(cmds[0]!.at.y)
    // `end` puts each line's right edge at the anchor, so both start left of 0.
    expect(cmds[0]!.at.x).toBeLessThan(0)
    expect(cmds[1]!.at.x).toBeLessThan(0)
  })
})

describe('the option facade', () => {
  it('resolves {a} / {b} / {c} / {d} per datum', () => {
    const { spec, warnings } = compileOption({
      ...base,
      series: [{ type: 'bar', name: 'Sales', data: [30, 10], label: { show: true, formatter: '{a}: {b} = {c} ({d}%)' } }],
    })
    expect(warnings).toEqual([])
    expect(spec.series[0]!.labelTexts).toEqual(['Sales: Mon = 30 (75%)', 'Sales: Tue = 10 (25%)'])
  })

  it('calls a FUNCTION formatter with the ECharts params, and carries colour, size and rich styles', () => {
    const seen: unknown[] = []
    const { spec } = compileOption({
      ...base,
      series: [{
        type: 'bar',
        name: 'S',
        data: [1, 3],
        label: {
          show: true,
          color: '#abcdef',
          fontSize: 18,
          rich: { big: { color: '#ff0000', fontSize: 30 } },
          formatter: (p: { name: string; value: number; dataIndex: number; percent: number }) => {
            seen.push(p)
            return `{big|${p.value}}@${p.name}`
          },
        },
      }],
    })
    expect(spec.series[0]!.labelTexts).toEqual(['{big|1}@Mon', '{big|3}@Tue'])
    expect(spec.series[0]!.labelColor).toBe('#abcdef')
    expect(spec.series[0]!.labelSize).toBe(18)
    expect(spec.series[0]!.labelRich).toEqual([{ name: 'big', color: '#ff0000', fontSize: 30 }])
    expect(seen).toHaveLength(2)
    expect(seen[1]).toMatchObject({ name: 'Tue', value: 3, dataIndex: 1, seriesName: 'S' })
  })

  it('draws the resolved label through the renderer, styled', () => {
    const { spec } = compileOption({
      ...base,
      series: [{ type: 'bar', name: 'S', data: [5, 7], label: { show: true, color: '#123456', formatter: '{b}' } }],
    }, { width: 300, height: 200 })
    const drawn = texts(renderChart(spec, measure)).filter((c) => c.fill === '#123456')
    expect(drawn.map((c) => c.text)).toEqual(['Mon', 'Tue'])
  })

  it('names an unsupported placeholder and an unsupported rich key rather than dropping them', () => {
    const { warnings, spec } = compileOption({
      ...base,
      series: [{ type: 'bar', data: [1, 2], label: { show: true, formatter: '{c} {e}', rich: { a: { fontWeight: 'bold' } } } }],
    })
    expect(warnings.map((w) => w.path).sort()).toEqual(['series[0].label.formatter', 'series[0].label.rich.a.fontWeight'])
    // The unknown placeholder is left as written rather than silently blanked.
    expect(spec.series[0]!.labelTexts![0]).toContain('{e}')
  })

  it('a label with no formatter still shows the value, as before', () => {
    const { spec } = compileOption({ ...base, series: [{ type: 'bar', data: [4, 6], label: { show: true } }] }, { width: 300, height: 200 })
    expect(spec.series[0]!.labelTexts).toBeUndefined()
    expect(texts(renderChart(spec, measure)).map((c) => c.text)).toContain('4')
  })
})
