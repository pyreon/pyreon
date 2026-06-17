// `Array.prototype.reduce(reducer, initial)` method-call emit. Distinct
// from the `rx.reduce(source, reducer, initial)` FUNCTION form (covered
// in rx-*.test.ts): the METHOD form falls through the generic call emit
// and previously emitted args in JS order — invalid on BOTH targets
// (Swift `reduce` takes the initial FIRST; Kotlin `reduce` has no initial
// arg at all — the initial-value form is `fold`). Aggregation
// (totals/sums over table rows) is core to analytical apps, so the
// 2-arg form must lower correctly. The no-initial 1-arg form is left to
// the generic emit (valid Kotlin `reduce {}`; a known Swift gap).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (expr: string) =>
  `import { signal, computed } from '@pyreon/reactivity'
export function C() {
  const xs = signal<number[]>([1, 2, 3])
  const total = computed(() => ${expr})
  return total
}`

describe('Array.prototype.reduce(reducer, initial) method-call emit', () => {
  it('Swift: reduce(cb, init) → reduce(init, cb) (initial first)', () => {
    const out = transform(SRC('xs().reduce((s, x) => s + x, 0)'), { target: 'swift' }).code
    expect(out).toContain('reduce(0, { s, x in s + x })')
    // must NOT emit the JS arg order (closure first)
    expect(out).not.toMatch(/reduce\(\{ s, x in[^}]*\}, 0\)/)
  })

  it('Kotlin: reduce(cb, init) → fold(init, cb)', () => {
    const out = transform(SRC('xs().reduce((s, x) => s + x, 0)'), { target: 'kotlin' }).code
    expect(out).toContain('fold(0, { s, x -> s + x })')
    // Kotlin reduce takes no initial — the 2-arg method form must NOT
    // emit as `.reduce(...)`.
    expect(out).not.toContain('.reduce(')
  })

  it('Swift: object-field reducer over a struct array → reduce(0, …)', () => {
    const src = `import { signal, computed } from '@pyreon/reactivity'
type Row = { revenue: number }
export function C() {
  const rows = signal<Row[]>([{ revenue: 10 }])
  const total = computed(() => rows().reduce((s, r) => s + r.revenue, 0))
  return total
}`
    const out = transform(src, { target: 'swift' }).code
    expect(out).toContain('reduce(0, { s, r in s + r.revenue })')
  })

  it('no regression: .map / .filter still pass through verbatim (single closure)', () => {
    const swift = transform(SRC('xs().map((x) => x * 2).filter((x) => x > 1)'), {
      target: 'swift',
    }).code
    expect(swift).toContain('.map(')
    expect(swift).toContain('.filter(')
  })
})
