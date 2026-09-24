// `<ChartThemeProvider light dark>` on native: the mode's theme, then
// `theme`, then the override for the mode in effect — the colour mode a
// `<ColorModeProvider>` / `<PyreonUI>` pinned above it, wherever it sits
// relative to the provider. The same layering the web provider does.
import { describe, expect, it } from 'vitest'
import { chartThemeScope, colorModeScope, CHART_THEMES } from '../chart-hosts'
import type { ExprIR } from '../types'

const lit = (value: string | number): ExprIR => ({ kind: 'literal', value } as ExprIR)
const obj = (fields: Record<string, string | number>): ExprIR => ({ kind: 'object', fields: Object.entries(fields).map(([name, v]) => ({ name, value: lit(v) })) } as ExprIR)
const el = (tag: string, attrs: Record<string, ExprIR>): ExprIR & { kind: 'jsx-element' } =>
  ({ kind: 'jsx-element', tag, attrs: Object.entries(attrs).map(([name, value]) => ({ kind: 'attr', name, value })), children: [] }) as ExprIR & { kind: 'jsx-element' }
const provider = (attrs: Record<string, ExprIR>) => el('ChartThemeProvider', attrs)
const colorMode = (mode: string) => el('ColorModeProvider', { mode: lit(mode) })

describe('native <ChartThemeProvider light / dark>', () => {
  it("applies the pinned mode's override over `theme`", () => {
    const warns: string[] = []
    const dark = colorModeScope(colorMode('dark'), (w) => warns.push(w))
    const t = chartThemeScope(provider({ theme: obj({ radius: 7, background: '#111111' }), dark: obj({ background: '#0b1020' }), light: obj({ background: '#ffffff' }) }), (w) => warns.push(w), dark)
    expect(t.background).toBe('#0b1020')
    expect(t.radius).toBe('7.0')
    expect(t.text).toBe(CHART_THEMES.dark.text)
    expect(warns).toEqual([])
  })

  it('a nested provider inherits the mode for its overrides', () => {
    const outer = chartThemeScope(provider({}), () => {}, colorModeScope(colorMode('dark'), () => {}))
    const inner = chartThemeScope(provider({ dark: obj({ background: '#0b1020' }), light: obj({ background: '#fafafa' }) }), () => {}, outer)
    expect(inner.background).toBe('#0b1020')
  })

  it("a mode pinned BELOW a provider re-resolves that provider's layers for it", () => {
    const p = chartThemeScope(provider({ theme: obj({ radius: 5 }), dark: obj({ background: '#0b1020' }), light: obj({ background: '#fafafa' }) }), () => {}, colorModeScope(colorMode('light'), () => {}))
    expect(p.background).toBe('#fafafa')
    const below = colorModeScope(colorMode('dark'), () => {}, p)!
    expect(below.background).toBe('#0b1020')
    expect(below.radius, "the provider's shared layer survives the re-resolve").toBe('5.0')
    expect(below.text).toBe(CHART_THEMES.dark.text)
  })

  it("'system' and an absent mode keep the scope in force", () => {
    const p = chartThemeScope(provider({}), () => {})
    expect(colorModeScope(colorMode('system'), () => {}, p)).toBe(p)
    expect(colorModeScope(el('PyreonUI', {}), () => {}, p)).toBe(p)
  })

  it('a `mode` on the provider is named as moved, and ignored', () => {
    const warns: string[] = []
    const t = chartThemeScope(provider({ mode: lit('dark') }), (w) => warns.push(w))
    expect(t.background).toBe(CHART_THEMES.light.background)
    expect(warns[0]).toContain('<ChartThemeProvider mode>: the mode is not a provider prop any more')
  })

  it('with no mode anywhere, the light override applies (native has no system scheme to read)', () => {
    const t = chartThemeScope(provider({ dark: obj({ background: '#0b1020' }), light: obj({ background: '#fafafa' }) }), () => {})
    expect(t.background).toBe('#fafafa')
  })
})
