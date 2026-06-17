// `String(x)` — the JS number/value → string coercion (every numeric
// table cell: `String(row.revenue)`). Swift's `String(x)` is valid, but
// Kotlin has NO `String(Any)` constructor (only `String(CharArray)`), so
// the verbatim emit was invalid Kotlin. Now mapped to `(x).toString()`
// on the Kotlin backend; Swift is unchanged.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (expr: string) =>
  `import { signal } from '@pyreon/reactivity'
export function C() { const n = signal(5); return ${expr} }`

describe('String(x) coercion emit', () => {
  it('Kotlin: String(x) → (x).toString()', () => {
    const out = transform(SRC('String(n())'), { target: 'kotlin' }).code
    expect(out).toContain('(n).toString()')
    expect(out).not.toContain('String(n)')
  })

  it('Kotlin: String over a member expr → (expr).toString()', () => {
    const src = `import { signal } from '@pyreon/reactivity'
type Row = { revenue: number }
export function C() {
  const rows = signal<Row[]>([{ revenue: 10 }])
  return String(rows()[0].revenue)
}`
    const out = transform(src, { target: 'kotlin' }).code
    expect(out).toContain('.toString()')
    expect(out).not.toMatch(/\bString\(rows/)
  })

  it('Swift: String(x) stays String(x) (valid Swift)', () => {
    const out = transform(SRC('String(n())'), { target: 'swift' }).code
    expect(out).toContain('String(n)')
  })
})
