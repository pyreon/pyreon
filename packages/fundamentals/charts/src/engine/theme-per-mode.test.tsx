// `<ChartThemeProvider>` layers: the mode's built-in theme, then `theme`
// (both modes), then `light` / `dark` (the mode in effect). A provider with
// no `mode` inherits its parent's, so its per-mode overrides still pick the
// right one.
import { h } from '@pyreon/core'
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
    const dark = probe((c) => h(ChartThemeProvider, { mode: 'dark', theme: { radius: 7, background: '#111111' }, dark: { background: '#0b1020' }, light: { background: '#ffffff' } }, c))
    expect(dark().background).toBe('#0b1020')
    expect(dark().radius).toBe(7)
    expect(dark().text).toBe(chartThemes.dark.text)
    const light = probe((c) => h(ChartThemeProvider, { mode: 'light', theme: { radius: 7 }, dark: { background: '#0b1020' }, light: { background: '#fafafa' } }, c))
    expect(light().background).toBe('#fafafa')
    expect(light().radius).toBe(7)
  })

  it('a provider without `mode` inherits the parent mode for its overrides', () => {
    const t = probe((c) => h(ChartThemeProvider, { mode: 'dark' }, h(ChartThemeProvider, { dark: { palette: ['#abcdef'] }, light: { palette: ['#123456'] } }, c)))
    expect(t().palette).toEqual(['#abcdef'])
    expect(t().background).toBe(chartThemes.dark.background)
  })

  it('a reactive mode switches which override applies', () => {
    const mode = signal<'light' | 'dark'>('light')
    const t = probe((c) => h(ChartThemeProvider, { mode: () => mode(), dark: { background: '#0b1020' }, light: { background: '#fafafa' } }, c))
    expect(t().background).toBe('#fafafa')
    mode.set('dark')
    expect(t().background).toBe('#0b1020')
  })
})
