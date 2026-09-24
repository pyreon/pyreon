import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * `<PlotChart>` colours a mark by its LABEL, as the web's `resolveMarks` does:
 * an area and a line both labelled Revenue are one series to the reader, so
 * they share a palette slot and the legend shows ONE Revenue entry. Before,
 * each mark took the next slot by index, on every target.
 */
const src = (marks: string): string => `
import { PlotChart, area, line } from '@pyreon/charts/engine'
const ROWS = [{ m: 'a', v: 1, t: 2 }, { m: 'b', v: 3, t: 4 }]
export function App() {
  return <PlotChart data={ROWS} x={(d) => d.m} marks={[${marks}]} showLegend legendToggle />
}`

const colors = (code: string): string[] => [...code.matchAll(/color(?:: | = )"(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]!)

describe.each(['swift', 'kotlin'] as const)('label-keyed mark colour on %s', (target) => {
  const shared = transform(src("area((d) => d.v, { label: 'Revenue' }), line((d) => d.v, { label: 'Revenue' }), line((d) => d.t, { label: 'Target' })"), { target })
  const distinct = transform(src("line((d) => d.v, { label: 'A' }), line((d) => d.t, { label: 'B' })"), { target })

  it('marks sharing a label share a colour; the next label takes the next slot', () => {
    expect(shared.warnings).toEqual([])
    const c = colors(shared.code)
    expect(c).toHaveLength(3)
    expect(c[0]).toBe(c[1])
    expect(c[2]).not.toBe(c[0])
  })

  it('distinct labels colour by index, as before', () => {
    const c = colors(distinct.code)
    expect(c).toHaveLength(2)
    expect(c[0]).not.toBe(c[1])
  })

  it('the legend groups by label', () => {
    expect(shared.code).toContain('legendEntriesGrouped(')
    expect(shared.code).toContain('legendToggleGroup(')
  })

  it('the toolchain accepts it', () => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(shared.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(shared.code)).toMatchObject({ ok: true })
  })
})
