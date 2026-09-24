// `<ChartThemeProvider light dark>` on native: the mode's theme, then
// `theme`, then the override for the mode in effect — a literal `mode`, or
// the one an outer provider pinned. The same layering the web provider does.
import { describe, expect, it } from 'vitest'
import { chartThemeScope, CHART_THEMES } from '../chart-hosts'
import type { ExprIR } from '../types'

const lit = (value: string | number): ExprIR => ({ kind: 'literal', value } as ExprIR)
const obj = (fields: Record<string, string | number>): ExprIR => ({ kind: 'object', fields: Object.entries(fields).map(([name, v]) => ({ name, value: lit(v) })) } as ExprIR)
const provider = (attrs: Record<string, ExprIR>): ExprIR & { kind: 'jsx-element' } =>
  ({ kind: 'jsx-element', tag: 'ChartThemeProvider', attrs: Object.entries(attrs).map(([name, value]) => ({ kind: 'attr', name, value })), children: [] }) as ExprIR & { kind: 'jsx-element' }

describe('native <ChartThemeProvider light / dark>', () => {
  it('applies the pinned mode\'s override over `theme`', () => {
    const warns: string[] = []
    const t = chartThemeScope(provider({ mode: lit('dark'), theme: obj({ radius: 7, background: '#111111' }), dark: obj({ background: '#0b1020' }), light: obj({ background: '#ffffff' }) }), (w) => warns.push(w))
    expect(t.background).toBe('#0b1020')
    expect(t.radius).toBe('7.0')
    expect(t.text).toBe(CHART_THEMES.dark.text)
    expect(warns).toEqual([])
  })

  it('a nested provider without `mode` inherits the outer mode for its overrides', () => {
    const outer = chartThemeScope(provider({ mode: lit('dark') }), () => {})
    const inner = chartThemeScope(provider({ dark: obj({ background: '#0b1020' }), light: obj({ background: '#fafafa' }) }), () => {}, outer)
    expect(inner.background).toBe('#0b1020')
  })

  it('with no mode anywhere, the light override applies (native has no system scheme to read)', () => {
    const t = chartThemeScope(provider({ dark: obj({ background: '#0b1020' }), light: obj({ background: '#fafafa' }) }), () => {})
    expect(t.background).toBe('#fafafa')
  })
})
