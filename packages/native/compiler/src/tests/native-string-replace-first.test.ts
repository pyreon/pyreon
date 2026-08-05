// `str.replace(a, b)` — the first-only string replace.
//
// The arm was deliberately left unmapped, on the reasoning that JS `replace`
// is FIRST-only while both native idioms (`replacingOccurrences`,
// Kotlin `String.replace`) are replace-ALL, so no honest mapping existed.
//
// The decision was right. The FALLTHROUGH was not: an unmapped method is
// emitted VERBATIM, which produced two different wrong answers from one line
// of shared source —
//
//   Swift   s.replace("a", "b")  → no such signature; `missing argument
//                                  label 'with:'`, a HARD compile error
//   Kotlin  s.replace("a", "b")  → compiles, and replaces EVERY occurrence
//
// — with no warning on either target. "Deliberately not mapped" only holds if
// something catches the shape; here nothing did, so the author got a build
// failure on one platform and silently wrong output on the other.
//
// There IS a faithful mapping on both:
//   Kotlin  `replaceFirst(old, new)` — the literal, first-only twin.
//   Swift   no stdlib one-liner, so an IIFE over
//           `replacingOccurrences(of:with:options:range:)` bounded to the
//           first match. A non-nil range replaces INSIDE it (once); a nil
//           range means the needle is absent, where replace-all is also a
//           no-op. Operands are bound as parameters so the receiver is
//           evaluated exactly once despite appearing twice in the body.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (body: string) => `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const raw = signal('a-b-c')
  ${body}
  return (<Stack><Text>{out()}</Text></Stack>)
}`

const emit = (target: 'swift' | 'kotlin', body: string, needle: string) =>
  transform(app(body), { target }).code.split('\n').find((l) => l.includes(needle)) ?? ''

const FIRST = `const out = () => raw().replace('-', '+')`
const ALL = `const out = () => raw().replaceAll('-', '+')`

describe('str.replace lowers to a FIRST-only replace', () => {
  it('Kotlin: replaceFirst, not replace (which is replace-ALL)', () => {
    const line = emit('kotlin', FIRST, 'fun out')
    expect(line).toContain('replaceFirst("-", "+")')
    // The bug shape — the identical-looking call that replaces everything.
    expect(line).not.toMatch(/\braw\.replace\(/)
  })

  it('Swift: a first-match-bounded replacingOccurrences, not a bare .replace', () => {
    const line = emit('swift', FIRST, 'func out')
    expect(line).toContain('range: s.range(of: f)')
    // The bug shape — a Swift method with no such signature.
    expect(line).not.toMatch(/raw\.replace\(/)
  })

  // Each operand appears once in the ARGUMENT list, so a receiver with side
  // effects is not evaluated twice even though the body references it twice.
  it('Swift: binds operands as parameters (single evaluation)', () => {
    const line = emit('swift', FIRST, 'func out')
    expect(line).toContain('(s: String, f: String, r: String) -> String in')
    expect(line).toContain('}(raw, "-", "+")')
  })

  // replaceAll must keep its replace-ALL mapping — the two are different
  // functions and the point of this change is that they stop being confused.
  it('replaceAll still maps to replace-ALL on both targets', () => {
    expect(emit('kotlin', ALL, 'fun out')).toContain('raw.replace("-", "+")')
    expect(emit('swift', ALL, 'func out')).toContain(
      'raw.replacingOccurrences(of: "-", with: "+")',
    )
  })

  // Sibling gap found while fixing the above: `replaceAll` and `repeat` both
  // LOWER but were missing from the string return-type table, so a helper
  // wrapping one emitted a Swift `func` with no return type — Void. It stayed
  // hidden because Swift will interpolate `()` into a string; assigning the
  // result anywhere typed is where it breaks.
  it('a helper over replaceAll returns String, not Void', () => {
    expect(emit('swift', ALL, 'func out')).toContain('func out() -> String')
  })

  it('a helper over repeat returns String, not Void', () => {
    const line = emit('swift', `const out = () => raw().repeat(3)`, 'func out')
    expect(line).toContain('func out() -> String')
  })
})

// The toolchain half. Swift is the load-bearing one here: the old emit was a
// hard compile error there, so this is the assertion that reproduces the
// shipped break. Kotlin compiled the wrong function, which no compiler can
// catch — the string-shape assertion above is what covers that side.
describe('the replace emit survives the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift: type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(app(FIRST), { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: compiles on kotlinc', () => {
    const r = validateKotlin(transform(app(FIRST), { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
