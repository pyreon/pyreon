import { DEFAULT_PALETTE, paletteAt } from './palette'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'
import { palettes } from './palettes'
import { chartThemes, resolveChartTheme, tooltipStyle } from './theme'

const HEX = /^#[0-9a-f]{6}$/

describe('palettes', () => {
  it('every named palette is a non-empty list of lowercase 6-digit hex colours, and pyreon IS the engine default', () => {
    for (const [name, list] of Object.entries(palettes)) {
      expect(list.length, name).toBeGreaterThan(0)
      for (const c of list) expect(c, `${name}: ${c}`).toMatch(HEX)
    }
    expect([...palettes.pyreon]).toEqual(DEFAULT_PALETTE)
    expect(palettes.pyreonDark.length).toBe(palettes.pyreon.length)
  })
  it('paletteAt cycles and an empty palette falls back to the default', () => {
    expect(paletteAt(['#111111', '#222222'], 0)).toBe('#111111')
    expect(paletteAt(['#111111', '#222222'], 3)).toBe('#222222')
    expect(paletteAt([], 1)).toBe(DEFAULT_PALETTE[1])
  })
})

describe('chartThemes', () => {
  it('light is the engine default; dark differs on every colour token and shares the metrics', () => {
    expect(chartThemes.light).toBe(defaultTheme)
    const { light, dark } = chartThemes
    for (const k of ['background', 'surface', 'text', 'label', 'axis', 'grid'] as const) expect(dark[k], k).not.toBe(light[k])
    for (const k of ['fontSize', 'titleSize', 'radius', 'enterMs', 'updateMs', 'fontFamily'] as const) expect(dark[k], k).toBe(light[k])
    expect(dark.palette).toEqual([...palettes.pyreonDark])
  })
  it('resolveChartTheme merges defined fields only and never mutates the base', () => {
    const merged = resolveChartTheme(chartThemes.light, { palette: ['#123456'], label: undefined, radius: 6 } as unknown as Partial<ChartTheme>)
    expect(merged.palette).toEqual(['#123456'])
    expect(merged.label).toBe(chartThemes.light.label)
    expect(merged.radius).toBe(6)
    expect(chartThemes.light.radius).toBe(0)
    expect(resolveChartTheme(chartThemes.dark)).toBe(chartThemes.dark)
  })
  it('tooltipStyle reads the surface, text, grid and font tokens', () => {
    const s = tooltipStyle(chartThemes.dark, 'system-ui')
    expect(s).toContain('background:#1c2230')
    expect(s).toContain('color:#e6eaf2')
    expect(s).toContain('font:11px system-ui')
    expect(tooltipStyle({ ...chartThemes.light, fontFamily: 'Inter' }, 'system-ui')).toContain('font:11px Inter')
  })
})
