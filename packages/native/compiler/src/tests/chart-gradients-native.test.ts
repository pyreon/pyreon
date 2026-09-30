import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/** A mark's literal `gradient` option lowers to the engine's `SeriesGradient` on native. */
describe.each(['swift', 'kotlin'] as const)('grammar gradient on %s', (target) => {
  it('a PlotChart mark with a literal gradient option lowers the same SeriesGradient', () => {
    const r = transform(`
import { PlotChart, bars, line } from '@pyreon/charts/engine'
export function App() {
  return <PlotChart data={[{ x: 'a', v: 1 }, { x: 'b', v: 2 }]} x={(d) => d.x} marks={[
    bars((d) => d.v, { gradient: { stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }], direction: 'horizontal' } }),
    line((d) => d.v, { color: '#123456' }),
  ]} />
}`, { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`gradient${sep}SeriesGradient(`)
    expect(r.code).toContain(`direction${sep}"horizontal"`)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})
