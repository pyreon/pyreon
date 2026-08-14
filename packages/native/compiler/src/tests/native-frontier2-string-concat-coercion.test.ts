// JS `+` where EITHER operand is a string is string CONCATENATION — the
// non-string operand is coerced to text (`"count: " + 5 === "count: 5"`).
// Native has no such implicit coercion, so a mixed String/non-String `+`
// failed to compile:
//
//   const out = "count: " + n()          // n: number
//
// Swift emitted `"count: " + n` → "binary operator '+' cannot be applied to
// operands of type 'String' and 'Int'"; the mirror `n() + " items"` failed
// the same way. Kotlin's `String.plus(Any?)` coerces a RIGHT-hand non-string
// so `"count: " + n` compiled there, but the LEFT-hand form `n() + " items"`
// (`Int.plus(String)`) has no candidate and failed — so the two targets
// diverged and one whole idiomatic concat shape was uncompilable.
//
// `inferType`'s binary case ALREADY types a string-concat `+` as `string`
// (one side string ⇒ string result); only the EMIT lacked the coercion. Both
// backends now coerce each CONCRETE non-string operand of a string-concat `+`
// — Swift `String(...)` (Int/Double/Bool conform to LosslessStringConvertible),
// Kotlin `(...).toString()` — regardless of operand order. A purely numeric
// `+` never enters the branch (arithmetic handling unchanged), and a
// `string + <unknown>` leaves the unknown operand alone (best-effort).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (body: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
function App() {
  ${body}
  return (<Stack><Text>{out}</Text></Stack>)
}`

const outLine = (target: 'swift' | 'kotlin', body: string) =>
  transform(app(body), { target }).code.split('\n').find((l) => / out /.test(l)) ?? ''

const STR_INT = `const n = signal(5)
  const out = "count: " + n()`
const INT_STR = `const n = signal(5)
  const out = n() + " items"`
const STR_DOUBLE = `const x = signal(3.5)
  const out = "v=" + x()`
const STR_BOOL = `const b = signal(true)
  const out = "on=" + b()`

const MIXED = [STR_INT, INT_STR, STR_DOUBLE, STR_BOOL]

describe('a mixed String/non-String `+` concatenates on both targets', () => {
  it('Swift: the non-string operand is coerced String(...)', () => {
    expect(outLine('swift', STR_INT)).toContain('"count: " + String(n)')
    expect(outLine('swift', INT_STR)).toContain('String(n) + " items"')
    expect(outLine('swift', STR_DOUBLE)).toContain('"v=" + String(x)')
    expect(outLine('swift', STR_BOOL)).toContain('"on=" + String(b)')
  })

  it('Kotlin: the non-string operand is coerced (...).toString()', () => {
    expect(outLine('kotlin', STR_INT)).toContain('"count: " + (n).toString()')
    expect(outLine('kotlin', INT_STR)).toContain('(n).toString() + " items"')
    expect(outLine('kotlin', STR_DOUBLE)).toContain('"v=" + (x).toString()')
    expect(outLine('kotlin', STR_BOOL)).toContain('"on=" + (b).toString()')
  })

  // Strictly additive: a pure String+String concat and a pure Int+Int
  // arithmetic `+` are byte-identical to the pre-fix emit (no coercion).
  it('control: String + String is untouched', () => {
    const body = `const s = signal("x")
  const out = "a" + s()`
    expect(outLine('swift', body)).toContain('"a" + s')
    expect(outLine('swift', body)).not.toContain('String(')
    expect(outLine('kotlin', body)).toContain('"a" + s')
    expect(outLine('kotlin', body)).not.toContain('.toString()')
  })

  it('control: Int + Int arithmetic is untouched', () => {
    const body = `const n = signal(5)
  const out = n() + 3`
    expect(outLine('swift', body)).toContain('n + 3')
    expect(outLine('swift', body)).not.toContain('String(')
    expect(outLine('kotlin', body)).toContain('n + 3')
    expect(outLine('kotlin', body)).not.toContain('.toString()')
  })

  // A genuinely-unsupported adjacent shape still warns: a tagged template
  // literal has no native equivalent (proves the fix didn't swallow the
  // warning path for the surrounding expression machinery).
  it('adjacent unsupported shape still warns (tagged template)', () => {
    const body = `const s = signal("x")
  const out = css\`color: \${s()}\``
    const r = transform(app(body), { target: 'swift' })
    expect(r.warnings.some((w) => /tagged template/i.test(w))).toBe(true)
  })

  it.runIf(isSwiftcAvailable())('Swift: all mixed concat forms compile', () => {
    for (const body of MIXED) {
      const r = validateSwiftWithStubs(transform(app(body), { target: 'swift' }).code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    }
  })

  it.runIf(isKotlincAvailable())('Kotlin: all mixed concat forms compile', () => {
    for (const body of MIXED) {
      const r = validateKotlin(transform(app(body), { target: 'kotlin' }).code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    }
  })
})
