// An option chart under a dark theme must actually be dark. Found in the docs
// gallery: the gauge kept ECharts' light-theme text tokens (#3c3c41 on a
// #141821 ground), the SVG family path ignored `theme` entirely, and
// `<OptionChart>` ignored an explicit `<ChartThemeProvider>` — while a bare
// option chart keeps ECharts' own light look, exactly as ECharts does.
import { ColorModeProvider, h, systemColorMode } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { optionToSvg } from './option'
import { OptionChart } from './OptionChart'
import { ChartThemeProvider, chartThemes } from './theme'

const GAUGE = { series: [{ type: 'gauge', detail: { formatter: '{value}%' }, data: [{ value: 64, name: 'CPU' }] }] }
const fillOf = (svg: string, text: string): string | undefined => svg.match(new RegExp(`fill="([^"]+)"[^>]*>${text}</text>`))?.[1]

describe('the gauge follows a non-default theme', () => {
  it('dark: the value and title take the theme text and label colours', () => {
    const svg = optionToSvg(GAUGE as never, { width: 400, height: 300, theme: 'dark' } as never)
    expect(fillOf(svg, '64%')).toBe(chartThemes.dark.text)
    expect(fillOf(svg, 'CPU')).toBe(chartThemes.dark.label)
  })

  it("light (the default): ECharts' own tokens, unchanged", () => {
    const svg = optionToSvg(GAUGE as never, { width: 400, height: 300 } as never)
    expect(fillOf(svg, '64%')).toBe('#3c3c41')
    expect(fillOf(svg, 'CPU')).toBe('#54555a')
  })

  it('a colour the option set is left alone under a dark theme', () => {
    const own = { series: [{ type: 'gauge', detail: { color: '#ff0000', formatter: '{value}%' }, data: [{ value: 64, name: 'CPU' }] }] }
    expect(fillOf(optionToSvg(own as never, { width: 400, height: 300, theme: 'dark' } as never), '64%')).toBe('#ff0000')
  })
})

describe('<OptionChart> honours an explicit <ChartThemeProvider>', () => {
  function paints(node: ReturnType<typeof h>): { text: string; fill: string }[] {
    const out: { text: string; fill: string }[] = []
    let fill = ''
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (t, k) =>
        k === 'measureText'
          ? (text: string) => ({ width: text.length * 6 })
          : k === 'fillText'
            ? (text: string) => out.push({ text, fill })
            : k in t
              ? t[k]
              : () => undefined,
      set: (t, k, v) => {
        if (k === 'fillStyle') fill = String(v)
        t[k] = v
        return true
      },
    })
    const prev = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
    try {
      const root = document.createElement('div')
      document.body.appendChild(root)
      const un = mount(node, root)
      un()
      root.remove()
    } finally {
      HTMLCanvasElement.prototype.getContext = prev
    }
    return out
  }
  const TITLED = { title: { text: 'Heading' }, animation: false, xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] }

  it('a cartesian option under a dark provider draws its title in the dark text colour', () => {
    const t = paints(h(ColorModeProvider, { mode: 'dark' }, h(ChartThemeProvider, {}, h(OptionChart, { option: TITLED as never, width: 400, height: 240 }))))
    expect(t.find((p) => p.text === 'Heading')?.fill).toBe(chartThemes.dark.text)
  })

  it('a gauge option under a dark provider draws its value in the dark text colour', () => {
    const t = paints(h(ColorModeProvider, { mode: 'dark' }, h(ChartThemeProvider, {}, h(OptionChart, { option: { animation: false, ...GAUGE } as never, width: 400, height: 300 }))))
    expect(t.find((p) => p.text === '64%')?.fill).toBe(chartThemes.dark.text)
  })

  it('with no provider, a family option keeps the light look even on a dark OS', () => {
    // ECharts ignores the OS scheme; so does a bare option chart — its cartesian
    // half always did, and the family half must agree with it.
    const mode = systemColorMode() as unknown as { set: (m: 'light' | 'dark') => void }
    mode.set('dark')
    try {
      const t = paints(h(OptionChart, { option: { animation: false, ...GAUGE } as never, width: 400, height: 300 }))
      expect(t.find((p) => p.text === '64%')?.fill).toBe('#3c3c41')
    } finally {
      mode.set('light')
    }
  })

  it('with no chart provider, an option chart follows a mode the APP set', () => {
    const t = paints(h(ColorModeProvider, { mode: 'dark' }, h(OptionChart, { option: TITLED as never, width: 400, height: 240 })))
    expect(t.find((p) => p.text === 'Heading')?.fill).toBe(chartThemes.dark.text)
    const g = paints(h(ColorModeProvider, { mode: 'dark' }, h(OptionChart, { option: { animation: false, ...GAUGE } as never, width: 400, height: 300 })))
    expect(g.find((p) => p.text === '64%')?.fill).toBe(chartThemes.dark.text)
  })

  it('with no provider, a bare option chart keeps the light look', () => {
    const t = paints(h(OptionChart, { option: TITLED as never, width: 400, height: 240 }))
    expect(t.find((p) => p.text === 'Heading')?.fill).not.toBe(chartThemes.dark.text)
  })
})
