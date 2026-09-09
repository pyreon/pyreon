// `yDomain` is a ChartSpec field the geometry engine already consumes, and its
// sibling `y2Domain` has lowered as a one-liner since the second axis landed.
// `yDomain` sat in PLOT_UNLOWERED_PROPS instead, so a native chart could not
// pin its y range — it warned honestly, but a fixed axis range is basic
// charting, and nothing about it is web-specific.
//
// The position matters as much as the presence: Swift's memberwise init takes
// arguments in DECLARATION order, and `yDomain` is field 9 — before `yFormat`,
// not appended at the end where the batch-2 literal props go. That order is
// read off the generated struct rather than restated, so a regeneration cannot
// silently invalidate it.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { PLOT_UNLOWERED_PROPS } from '../chart-hosts'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

// The fixture shape the other plot suites use — a declared row interface, a
// STRING category accessor and numeric marks. A first pass wrote
// `{ x: 'a', y: 1.0 }` with `x={(d) => d.x}` and both toolchains rejected it
// at the fixture line, which reads exactly like an emit failure until you look
// at the line number.
const SRC = `import { PlotChart, line } from '@pyreon/charts/plot'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10 }, { m: 'Feb', v: 40 }]
export function C() {
  return <PlotChart data={ROWS} x={(d) => d.m} marks={[line((d) => d.v)]} yDomain={{ min: 0.0, max: 100.0 }} height={200} />
}`

const specLine = (target: 'swift' | 'kotlin'): string =>
  transform(SRC, { target }).code.split('\n').map((l) => l.trim()).find((l) => l.includes('ChartSpec(')) ?? ''

describe('yDomain lowers to both targets', () => {
  it('swift emits the Domain struct, and BEFORE yFormat/y2Domain (field order)', () => {
    const l = specLine('swift')
    expect(l).toContain('yDomain: Domain(min: 0.0, max: 100.0)')
    // Declaration order, not append order: showGrid (8) → yDomain (9).
    expect(l.indexOf('yDomain:')).toBeGreaterThan(l.indexOf('showGrid:'))
    const y2 = l.indexOf('y2Domain:')
    if (y2 >= 0) expect(l.indexOf('yDomain:')).toBeLessThan(y2)
  })

  it('kotlin emits the same data class', () => {
    // Kotlin writes `name = value`; asserting on `yDomain:` here would report a
    // false absence, which is exactly what a first pass at this test did.
    expect(specLine('kotlin')).toContain('yDomain = Domain(min = 0.0, max = 100.0)')
  })

  it('no longer warns, on either target', () => {
    for (const t of ['swift', 'kotlin'] as const) {
      expect(transform(SRC, { target: t }).warnings.filter((w) => w.includes('yDomain'))).toEqual([])
    }
    expect(PLOT_UNLOWERED_PROPS).not.toContain('yDomain')
  })

  it.skipIf(!isSwiftcAvailable())('swiftc accepts the emit', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.output).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the emit', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.output).toBe(true)
  })
})
