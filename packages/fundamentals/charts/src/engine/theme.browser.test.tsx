// Real Chromium: the theme actually reaches the pixels. A dark provider must
// recolour the bars and the ground; a `theme` prop must win over the provider;
// and a mode flip must repaint IN PLACE (same canvas element).
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { ChartThemeProvider, PlotChart, bars, chartThemes, palettes } from '../plot'

const rows = [{ q: 'a', v: 5 }, { q: 'b', v: 9 }]

/** Scan a horizontal band of the canvas for the first pixel matching one of `colours`. */
function findColour(canvas: HTMLCanvasElement, colours: readonly string[], fy: number): string | null {
  const ctx = canvas.getContext('2d')!
  const y = Math.round(canvas.height * fy)
  const row = ctx.getImageData(0, y, canvas.width, 1).data
  for (let x = 0; x < canvas.width; x++) {
    const c = '#' + [row[x * 4]!, row[x * 4 + 1]!, row[x * 4 + 2]!].map((n) => n.toString(16).padStart(2, '0')).join('')
    if (colours.includes(c)) return c
  }
  return null
}

describe('chart theme in the browser', () => {
  it('bars take the first palette colour; a dark provider swaps the palette and paints the ground', async () => {
    const mode = signal<'light' | 'dark'>('light')
    const { container, unmount } = mountInBrowser(
      h(ChartThemeProvider, { mode: () => mode() }, h(PlotChart, { data: rows, x: (d: (typeof rows)[number]) => d.q, marks: [bars((d: (typeof rows)[number]) => d.v)], width: 240, height: 160, animate: false, showGrid: false })),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    expect(findColour(canvas, [palettes.pyreon[0]!], 0.7)).toBe(palettes.pyreon[0])
    expect(canvas.style.background).toBe('')
    mode.set('dark')
    await flush()
    expect(container.querySelector('canvas')).toBe(canvas)
    expect(findColour(canvas, [palettes.pyreonDark[0]!], 0.7)).toBe(palettes.pyreonDark[0])
    expect(canvas.style.background).toBe('rgb(20, 24, 33)')
    unmount()
  })
  it('a `theme` prop wins over the provider', async () => {
    const { container, unmount } = mountInBrowser(
      h(ChartThemeProvider, { mode: 'dark' }, h(PlotChart, { data: rows, x: (d: (typeof rows)[number]) => d.q, marks: [bars((d: (typeof rows)[number]) => d.v)], theme: { palette: palettes.okabeIto, background: '#ffffff' }, width: 240, height: 160, animate: false, showGrid: false })),
    )
    await flush()
    const canvas = container.querySelector('canvas')!
    expect(findColour(canvas, [palettes.okabeIto[0]!], 0.7)).toBe(palettes.okabeIto[0])
    // The ground is CSS on the element (not in the bitmap), so the bitmap corner stays transparent.
    expect(canvas.style.background).toBe('rgb(255, 255, 255)')
    unmount()
  })
  it('with no provider the chart follows the system scheme (light in the test runner)', async () => {
    const { container, unmount } = mountInBrowser(h(PlotChart, { data: rows, x: (d: (typeof rows)[number]) => d.q, marks: [bars((d: (typeof rows)[number]) => d.v)], width: 240, height: 160, animate: false, showGrid: false }))
    await flush()
    const canvas = container.querySelector('canvas')!
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const expected = dark ? chartThemes.dark.palette[0]! : chartThemes.light.palette[0]!
    expect(findColour(canvas, [expected], 0.7)).toBe(expected)
    unmount()
  })
})
