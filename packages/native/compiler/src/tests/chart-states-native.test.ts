import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/** `selectedMode="series"` on the plot host: the whole-series pin crosses natively. */
describe.each(['swift', 'kotlin'] as const)('states on %s', (target) => {
  it('a PlotChart with selectedMode "series" lowers directly — the pin, the plot-hit, and no other pinning state', () => {
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
