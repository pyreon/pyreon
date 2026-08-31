import { describe, expect, it } from 'vitest'
import { measureApprox, renderSvg, svgCommand } from './svg'
import { defaultTheme, renderChart } from './render'
import { bars, line, resolveCategories, resolveMarks } from './marks'
import type { DrawCmd } from './types'

const FONT = 'system-ui, sans-serif'

describe('svgCommand', () => {
  it('rounds coordinates so the output is stable across platforms', () => {
    const s = svgCommand(
      { kind: 'rect', rect: { x: 0.1 + 0.2, y: 1, w: 2, h: 3 }, fill: '#000' },
      FONT,
    )
    // 0.1 + 0.2 is 0.30000000000000004 — the raw value would differ in the last
    // bits across engines and make any snapshot a flake.
    expect(s).toContain('x="0.3"')
    expect(s).not.toContain('0.30000')
  })

  it('normalises negative zero', () => {
    const s = svgCommand({ kind: 'rect', rect: { x: -0.001, y: 0, w: 1, h: 1 }, fill: '#000' }, FONT)
    expect(s).toContain('x="0"')
    expect(s).not.toContain('-0')
  })

  it('escapes XML-significant characters in labels', () => {
    const s = svgCommand(
      {
        kind: 'text',
        text: `Tom & Jerry <script>"'`,
        at: { x: 0, y: 0 },
        fill: '#000',
        size: 10,
        align: 'start',
        baseline: 'top',
      },
      FONT,
    )
    expect(s).toContain('Tom &amp; Jerry &lt;script&gt;&quot;&apos;')
    expect(s).not.toContain('<script>')
  })

  it('escapes the ampersand first so escapes are not double-escaped', () => {
    const s = svgCommand(
      {
        kind: 'text',
        text: '<',
        at: { x: 0, y: 0 },
        fill: '#000',
        size: 10,
        align: 'start',
        baseline: 'top',
      },
      FONT,
    )
    expect(s).toContain('&lt;')
    expect(s).not.toContain('&amp;lt;')
  })

  it('emits nothing for a degenerate polyline or polygon', () => {
    expect(
      svgCommand({ kind: 'polyline', points: [{ x: 1, y: 1 }], stroke: '#000', width: 1 }, FONT),
    ).toBe('')
    expect(
      svgCommand(
        { kind: 'polygon', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], fill: '#000' },
        FONT,
      ),
    ).toBe('')
  })

  it('maps every alignment and baseline', () => {
    const at = { x: 5, y: 6 }
    const mk = (align: 'start' | 'middle' | 'end', baseline: 'top' | 'middle' | 'bottom'): string =>
      svgCommand({ kind: 'text', text: 'x', at, fill: '#000', size: 10, align, baseline }, FONT)
    expect(mk('start', 'top')).toContain('text-anchor="start"')
    expect(mk('middle', 'top')).toContain('text-anchor="middle"')
    expect(mk('end', 'top')).toContain('text-anchor="end"')
    expect(mk('start', 'top')).toContain('dominant-baseline="hanging"')
    expect(mk('start', 'middle')).toContain('dominant-baseline="central"')
    // `bottom` is alphabetic, matching the canvas backend — the two must agree
    // or the same chart sits differently depending on which one drew it.
    expect(mk('start', 'bottom')).toContain('dominant-baseline="alphabetic"')
  })

  it('serialises the remaining primitives', () => {
    expect(
      svgCommand(
        { kind: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 5 }, stroke: '#abc', width: 2 },
        FONT,
      ),
    ).toBe('<line x1="0" y1="0" x2="10" y2="5" stroke="#abc" stroke-width="2"/>')
    expect(
      svgCommand(
        { kind: 'polyline', points: [{ x: 0, y: 0 }, { x: 1, y: 2 }], stroke: '#abc', width: 1 },
        FONT,
      ),
    ).toContain('points="0,0 1,2"')
    expect(
      svgCommand(
        { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], fill: '#f00' },
        FONT,
      ),
    ).toContain('<polygon points="0,0 1,0 1,1" fill="#f00"/>')
    expect(
      svgCommand({ kind: 'circle', center: { x: 3, y: 4 }, radius: 5, fill: '#0f0' }, FONT),
    ).toBe('<circle cx="3" cy="4" r="5" fill="#0f0"/>')
  })
})

describe('renderSvg', () => {
  const cmds: DrawCmd[] = [{ kind: 'rect', rect: { x: 0, y: 0, w: 10, h: 10 }, fill: '#123' }]

  it('emits a self-contained document with explicit size by default', () => {
    const s = renderSvg(cmds, 200, 100)
    expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(s).toContain('width="200" height="100" viewBox="0 0 200 100"')
    expect(s.endsWith('</svg>')).toBe(true)
  })

  it('scales to its container when responsive', () => {
    const s = renderSvg(cmds, 200, 100, { responsive: true })
    expect(s).toContain('width="100%"')
    expect(s).toContain('viewBox="0 0 200 100"')
    expect(s).not.toContain('height="100"')
  })

  it('is an unlabelled graphic with no title — role only', () => {
    const s = renderSvg(cmds, 10, 10)
    expect(s).toContain('role="img"')
    expect(s).not.toContain('aria-labelledby')
    expect(s).not.toContain('<title')
  })

  it('names and describes the graphic when given the text', () => {
    const s = renderSvg(cmds, 10, 10, { title: 'Revenue', description: 'Up 4%' })
    expect(s).toContain('aria-labelledby="pyreon-chart-title"')
    expect(s).toContain('<title id="pyreon-chart-title">Revenue</title>')
    expect(s).toContain('aria-describedby="pyreon-chart-desc"')
    expect(s).toContain('<desc id="pyreon-chart-desc">Up 4%</desc>')
  })

  it('escapes the title and description', () => {
    const s = renderSvg(cmds, 10, 10, { title: 'A & B', description: '<x>' })
    expect(s).toContain('<title id="pyreon-chart-title">A &amp; B</title>')
    expect(s).toContain('<desc id="pyreon-chart-desc">&lt;x&gt;</desc>')
  })

  it('keeps ids unique across charts on one page', () => {
    const s = renderSvg(cmds, 10, 10, { title: 'T', idPrefix: 'second' })
    expect(s).toContain('id="second-title"')
    expect(s).toContain('aria-labelledby="second-title"')
  })

  it('paints a background only when asked', () => {
    expect(renderSvg(cmds, 10, 10)).not.toContain('fill="#fff"')
    const s = renderSvg(cmds, 10, 10, { background: '#fff' })
    // The background rect must come FIRST or it covers the chart.
    expect(s.indexOf('fill="#fff"')).toBeLessThan(s.indexOf('fill="#123"'))
  })

  it('drops degenerate commands rather than emitting empty elements', () => {
    const s = renderSvg([{ kind: 'polyline', points: [], stroke: '#000', width: 1 }], 10, 10)
    expect(s).not.toContain('polyline')
  })

  it('renders a real chart end to end, with no canvas anywhere', () => {
    const data = [
      { m: 'Jan', v: 10 },
      { m: 'Feb', v: 30 },
      { m: 'Mar', v: 20 },
    ]
    const marks = [bars((d: (typeof data)[number]) => d.v), line((d: (typeof data)[number]) => d.v)]
    const spec = {
      width: 320,
      height: 200,
      series: resolveMarks(data, marks),
      categories: resolveCategories(data, (d: (typeof data)[number]) => d.m),
      theme: defaultTheme,
      showXAxis: true,
      showYAxis: true,
      showGrid: true,
    }
    const measure = measureApprox()
    const svg = renderSvg(renderChart(spec, measure), 320, 200, { title: 'Monthly' })
    expect(svg).toContain('<rect')
    expect(svg).toContain('<polyline')
    expect(svg).toContain('Jan')
    // Every coordinate is finite and rounded — no NaN leaked from layout.
    expect(svg).not.toContain('NaN')
    expect(svg).not.toContain('Infinity')
  })
})

describe('measureApprox', () => {
  it('grows with length and with font size', () => {
    const m = measureApprox()
    expect(m('ab', 10)).toBeGreaterThan(m('a', 10))
    expect(m('a', 20)).toBeCloseTo(m('a', 10) * 2)
  })

  it('treats digits and separators as narrower than letters', () => {
    const m = measureApprox()
    expect(m('1', 10)).toBeLessThan(m('m', 10))
    expect(m('.', 10)).toBeLessThan(m('1', 10))
  })

  it('is zero for the empty string', () => {
    expect(measureApprox()('', 12)).toBe(0)
  })

  it('takes a ratio for fonts that are not the system sans', () => {
    expect(measureApprox(1)('a', 10)).toBeGreaterThan(measureApprox(0.5)('a', 10))
  })
})
