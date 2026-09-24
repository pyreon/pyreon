// `<ChartThemeProvider>` layers: the mode's built-in theme, then `theme`
// (both modes), then `light` / `dark` — the framework-wide colour mode in
// effect WHERE THE CHART SITS (`ColorModeProvider` / `<PyreonUI>`), so a mode
// set below a provider still picks the right override.
import { ColorModeProvider, h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import type { ChartTheme } from './render'
import { ChartThemeProvider, chartThemes, useChartTheme } from './theme'

/** Mount `tree` with a probe inside and return the theme accessor it saw. */
function probe(wrap: (child: VNodeChild) => VNodeChild): () => ChartTheme {
  let seen: (() => ChartTheme) | null = null
  const Probe = (): VNodeChild => {
    seen = useChartTheme()
    return null
  }
  const host = document.createElement('div')
  mount(wrap(h(Probe, {})), host)
  return seen!
}

describe('<ChartThemeProvider light / dark>', () => {
  it('applies the override for the pinned mode, over `theme`', () => {
    const dark = probe((c) => h(ColorModeProvider, { mode: 'dark' }, h(ChartThemeProvider, { theme: { radius: 7, background: '#111111' }, dark: { background: '#0b1020' }, light: { background: '#ffffff' } }, c)))
    expect(dark().background).toBe('#0b1020')
    expect(dark().radius).toBe(7)
    expect(dark().text).toBe(chartThemes.dark.text)
    const light = probe((c) => h(ColorModeProvider, { mode: 'light' }, h(ChartThemeProvider, { theme: { radius: 7 }, dark: { background: '#0b1020' }, light: { background: '#fafafa' } }, c)))
    expect(light().background).toBe('#fafafa')
    expect(light().radius).toBe(7)
  })

  it('a mode set BELOW a provider still picks its override for the charts under it', () => {
    const t = probe((c) => h(ChartThemeProvider, { dark: { palette: ['#abcdef'] }, light: { palette: ['#123456'] } }, h(ColorModeProvider, { mode: 'dark' }, c)))
    expect(t().palette).toEqual(['#abcdef'])
    expect(t().background).toBe(chartThemes.dark.background)
  })

  it('with no provider at all, a chart follows the colour mode in scope', () => {
    expect(probe((c) => h(ColorModeProvider, { mode: 'dark' }, c))().background).toBe(chartThemes.dark.background)
    expect(probe((c) => h(ColorModeProvider, { mode: 'light' }, c))().background).toBe(chartThemes.light.background)
  })

  it('a reactive mode switches which override applies', () => {
    const mode = signal<'light' | 'dark'>('light')
    const t = probe((c) => h(ColorModeProvider, { mode: () => mode() }, h(ChartThemeProvider, { dark: { background: '#0b1020' }, light: { background: '#fafafa' } }, c)))
    expect(t().background).toBe('#fafafa')
    mode.set('dark')
    expect(t().background).toBe('#0b1020')
  })
})
