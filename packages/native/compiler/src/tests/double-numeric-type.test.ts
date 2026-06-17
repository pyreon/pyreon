// Double numeric type (foundation slice). PMTC modelled a single
// `number` type that always emitted `Int`; a fractional literal (`0.08`)
// therefore mis-emitted as `Int`. Now a NON-INTEGER literal infers
// `{ kind: 'number', float: true }` → Swift/Kotlin `Double`; an integer
// literal stays `Int` (the ergonomic default for counts/ids/indices).
//
// Scope of this slice: scalar signals/consts whose type is inferred from
// a literal initializer (via inferTypeFromInitial → swiftType/kotlinType).
// Struct fields (a separate string-literal type rep with no float slot)
// + Double-aware reduce seeds are the tracked next slices.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (body: string) =>
  `import { signal } from '@pyreon/reactivity'
export function C() { ${body} return null }`

describe('Double numeric type — fractional-literal inference', () => {
  it('Swift: signal(0.08) → Double; signal(7) → Int', () => {
    const out = transform(SRC('const rate = signal(0.08); const count = signal(7);'), {
      target: 'swift',
    }).code
    expect(out).toContain('rate: Double = 0.08')
    expect(out).toContain('count: Int = 7')
    expect(out).not.toContain('rate: Int')
  })

  it('Kotlin: fractional value preserved as a Double literal', () => {
    const out = transform(SRC('const rate = signal(2.5);'), { target: 'kotlin' }).code
    expect(out).toContain('mutableStateOf(2.5)')
  })

  it('Swift: a whole-number-valued float literal (3.0) stays… Int', () => {
    // `3.0` is integer-valued (Number.isInteger(3.0) === true in JS), so
    // it infers Int. Documents the literal-value boundary — a true
    // fractional like 3.5 is needed to get Double.
    const out = transform(SRC('const x = signal(3.0);'), { target: 'swift' }).code
    expect(out).toContain('x: Int')
  })
})
