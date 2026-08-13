// A mixed Int/Double conditional made the app uncompilable on Swift.
//
//   const out = computed(() => flag() ? 1 : 2.5)
//
// emitted `private var out: Int { flag ? 1 : 2.5 }` — swiftc:
//   "cannot convert return expression of type 'Double' to return type 'Int'".
//
// `inferType`'s ternary case returned the `then` branch's type verbatim when
// both branches were the same KIND, so a fractional `otherwise` branch was
// lost: `flag ? 1 : 2.5` typed Int (the `then` literal), while JS — and Swift's
// own literal unification — makes the whole expression Double. The computed's
// Swift annotation then disagreed with the value it wrapped.
//
// Kotlin compiled (its `if`-expression infers the `{Comparable<*> & Number}`
// LUB, which `.toString()` accepts) but produced a value that is NOT a Double —
// so a downstream Double consumer would break, and the two targets diverged.
//
// A TS `number` carries no int/float distinction, so Int is the right DEFAULT
// when there is no evidence. A fractional branch beside it is evidence: the
// whole ternary is Double. The emit then coerces the Int-typed branch
// (`Double(n)` / `(n).toDouble()`) so a NON-literal Int branch compiles too.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (body: string) => `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
function App() {
  ${body}
  return (<Stack><Text>{String(out)}</Text></Stack>)
}`

const outLine = (target: 'swift' | 'kotlin', body: string) =>
  transform(app(body), { target }).code.split('\n').find((l) => / out/.test(l)) ?? ''

const LIT = `const flag = signal(true)
  const out = computed(() => flag() ? 1 : 2.5)`
const NONLIT_INT_FLOAT = `const n = signal(3)
  const out = computed(() => (n() > 1) ? n() : 2.5)`
const FLOAT_NONLIT_INT = `const n = signal(3)
  const out = computed(() => (n() > 1) ? 2.5 : n())`

describe('a mixed Int/Double ternary unifies to Double on both targets', () => {
  it('Swift: the computed is annotated Double, not Int', () => {
    expect(outLine('swift', LIT)).toContain('out: Double')
    expect(outLine('swift', LIT)).not.toContain('out: Int')
  })

  it('Kotlin: the Int branch is coerced .toDouble()', () => {
    expect(outLine('kotlin', LIT)).toContain('(1).toDouble()')
  })

  it('Swift: a NON-literal Int branch is coerced Double(...)', () => {
    expect(outLine('swift', NONLIT_INT_FLOAT)).toContain('Double(n)')
    expect(outLine('swift', NONLIT_INT_FLOAT)).toContain('out: Double')
    // the mirror order coerces the trailing Int branch too
    expect(outLine('swift', FLOAT_NONLIT_INT)).toContain('Double(n)')
  })

  it('Kotlin: a NON-literal Int branch is coerced (n).toDouble()', () => {
    expect(outLine('kotlin', NONLIT_INT_FLOAT)).toContain('(n).toDouble()')
    expect(outLine('kotlin', FLOAT_NONLIT_INT)).toContain('(n).toDouble()')
  })

  // Strictly additive: an all-integer ternary stays Int (no coercion), and a
  // non-numeric ternary is untouched.
  it('control: an all-integer ternary stays Int, unchanged', () => {
    const body = `const flag = signal(true)
  const out = computed(() => flag() ? 1 : 2)`
    expect(outLine('swift', body)).toContain('out: Int')
    expect(outLine('swift', body)).not.toContain('Double(')
    expect(outLine('kotlin', body)).not.toContain('.toDouble()')
  })

  it('control: a string ternary is untouched', () => {
    const body = `const flag = signal(true)
  const out = computed(() => flag() ? 'a' : 'b')`
    expect(outLine('swift', body)).toContain('out: String')
    expect(outLine('swift', body)).not.toContain('Double(')
  })

  it.runIf(isSwiftcAvailable())('Swift: all mixed forms compile', () => {
    for (const body of [LIT, NONLIT_INT_FLOAT, FLOAT_NONLIT_INT]) {
      const r = validateSwiftWithStubs(transform(app(body), { target: 'swift' }).code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    }
  })

  it.runIf(isKotlincAvailable())('Kotlin: all mixed forms compile', () => {
    for (const body of [LIT, NONLIT_INT_FLOAT, FLOAT_NONLIT_INT]) {
      const r = validateKotlin(transform(app(body), { target: 'kotlin' }).code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    }
  })
})
