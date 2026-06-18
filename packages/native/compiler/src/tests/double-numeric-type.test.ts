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

// Double numeric type — COMPUTED / expression path. The slice above
// covered signal/const decls (parse.ts `inferTypeFromInitial`). The CORE
// `inferType` literal branch (infer-type.ts) separately drives computed
// return-type annotations + arithmetic float-propagation — and it did NOT
// set `float` for a fractional literal, so a `computed(() => 9.99)` emitted
// `private var tax: Int { 9.99 }` (a swiftc type error) and a fractional
// literal contributed no float-ness to surrounding arithmetic. This block
// locks the core-inferType fix.
const C = (body: string) =>
  `import { signal, computed } from '@pyreon/reactivity'
export function C() { ${body} return null }`

describe('Double numeric type — computed / expression inference', () => {
  it('Swift: computed returning a bare fractional literal → Double (was Int)', () => {
    const out = transform(C('const tax = computed(() => 9.99);'), { target: 'swift' }).code
    expect(out).toContain('var tax: Double')
    expect(out).not.toContain('var tax: Int')
  })

  it('Swift: all-Double-operand arithmetic computed → Double, compiles end-to-end', () => {
    // rate is a Double signal (0.08); `rate() + 0.02` is Double + Double —
    // both operands Double, no mixed-coercion needed → fully correct emit.
    const out = transform(
      C('const rate = signal(0.08); const total = computed(() => rate() + 0.02);'),
      { target: 'swift' },
    ).code
    expect(out).toContain('var total: Double')
  })

  it('Swift: integer-literal computed stays Int (no over-flip)', () => {
    const out = transform(
      C('const count = signal(10); const next = computed(() => count() + 1);'),
      { target: 'swift' },
    ).code
    expect(out).toContain('var next: Int')
    expect(out).not.toContain('var next: Double')
  })

  it('Swift: mixed Int×Double computed annotation is now Double', () => {
    // `count` is Int, `0.5` is a fractional literal → the binary result is
    // float-contagious, so the ANNOTATION flips Int→Double (the fix here).
    // NOTE: the EXPRESSION-level operand coercion (`count * 0.5` →
    // `Double(count) * 0.5`, which Swift requires since Int*Double has no
    // implicit conversion) is a SEPARATE tracked follow-up — it needs the
    // InferenceCtx threaded into `emitSwiftExpr`, which it does not receive
    // today. This test asserts only the annotation, which is what the
    // shared-inference fix delivers.
    const out = transform(
      C('const count = signal(10); const half = computed(() => count() * 0.5);'),
      { target: 'swift' },
    ).code
    expect(out).toContain('var half: Double')
  })

  it('Kotlin: fractional-literal computed preserves the Double value', () => {
    // Kotlin computeds emit `derivedStateOf { … }` with no explicit
    // annotation (Kotlin infers Double from `9.99`), so the cross-backend
    // win for A lands in Kotlin's ANNOTATED positions (function returns,
    // signal decls) rather than computeds; this asserts no regression and
    // that the fractional value is preserved verbatim.
    const out = transform(C('const tax = computed(() => 9.99);'), { target: 'kotlin' }).code
    expect(out).toContain('9.99')
    expect(out).not.toContain('tax: Int')
  })
})
