// `Array.prototype.sort((a,b) => <numeric>)` — sorting a table by a
// column, the core analytical-table interaction. Fell through the
// generic call emit and was output verbatim — invalid on BOTH targets:
// Swift `.sort` is mutating + Void and wants a Bool comparator (the JS
// comparator returns a number); Kotlin `.sort` has no lambda overload at
// all. Now lowered to Swift `sorted(by: { a, b in (<numeric>) < 0 })`
// and Kotlin `sortedWith(Comparator { a, b -> <numeric> })` — both
// non-mutating (render-safe). v1: a 2-param arrow comparator with an
// expression body; other shapes fall through.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (expr: string) =>
  `import { signal, computed } from '@pyreon/reactivity'
type Row = { region: string; revenue: number }
export function C() {
  const rows = signal<Row[]>([{ region: 'A', revenue: 5 }])
  const out = computed(() => ${expr})
  return out
}`

describe('Array.prototype.sort(comparator) emit', () => {
  it('Swift: descending → sorted(by: { a, b in (b.x - a.x) < 0 })', () => {
    const out = transform(SRC('[...rows()].sort((a, b) => b.revenue - a.revenue)'), {
      target: 'swift',
    }).code
    expect(out).toContain('.sorted(by: { a, b in (b.revenue - a.revenue) < 0 })')
    expect(out).not.toMatch(/\.sort\(\{/)
  })

  it('Swift: ascending → (a.x - b.x) < 0', () => {
    const out = transform(SRC('[...rows()].sort((a, b) => a.revenue - b.revenue)'), {
      target: 'swift',
    }).code
    expect(out).toContain('.sorted(by: { a, b in (a.revenue - b.revenue) < 0 })')
  })

  it('Kotlin: → sortedWith(Comparator { a, b -> b.x - a.x })', () => {
    const out = transform(SRC('[...rows()].sort((a, b) => b.revenue - a.revenue)'), {
      target: 'kotlin',
    }).code
    expect(out).toContain('.sortedWith(Comparator { a, b -> b.revenue - a.revenue })')
    expect(out).not.toMatch(/\.sort\(\{/)
  })
})
