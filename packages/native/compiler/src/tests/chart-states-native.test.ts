import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * ECharts' states cross the OptionChart natively as the same four Series
 * fields the web facade fills — `emphasis.focus` / `emphasis.itemStyle.color`,
 * `select.itemStyle.color`, `blur.itemStyle.opacity` — and `selectedMode`
 * becomes the host's tap-to-pin mode. What a state changes beyond its fill
 * is named, never dropped.
 */
const app = (series: string): string => `
import { OptionChart } from '@pyreon/charts/option'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['a', 'b', 'c'] }, yAxis: {}, series: [${series}] }} />
}`

describe.each(['swift', 'kotlin'] as const)('states on %s', (target) => {
  it('lowers emphasis / select / blur / selectedMode with zero warnings, and compiles', () => {
    const r = transform(app(`{ type: 'bar', data: [1, 2, 3], selectedMode: 'multiple', emphasis: { focus: 'self', itemStyle: { color: '#ee0000' } }, select: { itemStyle: { color: '#0000ee' } }, blur: { itemStyle: { opacity: 0.3 } } }`), { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`focus${sep}"self"`)
    expect(r.code).toContain(`emphasisColor${sep}"#ee0000"`)
    expect(r.code).toContain(`selectColor${sep}"#0000ee"`)
    expect(r.code).toContain(`blurOpacity${sep}0.3`)
    // `selectedMode` becomes the host's pin state, fed into the spec's emphasis.
    expect(r.code).toContain('pyreonSelected')
    expect(r.code).toMatch(/Emphasis\(highlight(: | = )-1, selected(: | = )/)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('lowers the state extras: labels, scale, state stroke and area opacity, whole-series selection', () => {
    const r = transform(app(`{ type: 'line', data: [1, 2, 3], selectedMode: 'series', emphasis: { focus: 'series', label: { show: true }, scale: 1.4, lineStyle: { width: 5 }, areaStyle: { opacity: 0.4 } }, select: { label: { show: true } }, blur: { lineStyle: { width: 1 } } }`), { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    for (const s of [`emphasisScale${sep}1.4`, `emphasisWidth${sep}5`, `emphasisAreaOpacity${sep}0.4`, `emphasisLabel${sep}true`, `selectLabel${sep}true`, `blurWidth${sep}1`]) expect(r.code).toContain(s)
    // `selectedMode: 'series'` lowers onto the PlotChart host's own series-pin state and its plot-hit.
    expect(r.code).toContain('pyreonSelectedSeries')
    expect(r.code).toContain('plotHitSeriesIn(')
    expect(r.code).toContain('applySeriesSelection(')
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('emphasis.scale "true" is 1.1, emphasis.disabled stops the highlight, still names an unknown focus/blurScope and select.disabled/lineStyle', () => {
    const r = transform(app(`{ type: 'bar', data: [1, 2, 3], emphasis: { focus: 'sibling', scale: true, disabled: true, blurScope: 'planet' }, select: { lineStyle: { width: 2 }, disabled: true }, blur: { label: { show: false } } }`), { target })
    expect(r.warnings).toEqual([
      expect.stringContaining('option.series[0].emphasis.focus>'),
      expect.stringContaining('option.series[0].emphasis.blurScope>'),
      expect.stringContaining('option.series[0].select.disabled>'),
      expect.stringContaining('option.series[0].select.lineStyle>'),
      expect.stringContaining('option.series[0].blur.label>'),
    ])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`emphasisScale${sep}1.1`)
    expect(r.code).toContain(`emphasisDisabled${sep}true`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('a PlotChart with selectedMode "series" lowers directly (not through OptionChart) — the pin, the plot-hit, and no other pinning state', () => {
    const r = transform(`
import { PlotChart, bars, line } from '@pyreon/charts/engine'
const ROWS = [{ a: 1, b: 4 }, { a: 2, b: 3 }, { a: 3, b: 2 }]
export function App() {
  return <PlotChart data={ROWS} marks={[bars((d) => d.a), line((d) => d.b)]} height={220} selectedMode="series" />
}`, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('pyreonSelectedSeries')
    expect(r.code).toContain('plotHitSeriesIn(')
    expect(r.code).toContain('applySeriesSelection(')
    // A datum-pin (`pyreonSelected`) is a SEPARATE, unrelated feature — series mode does not need it.
    expect(r.code).not.toContain('pyreonSelected =')
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})
