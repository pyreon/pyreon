// A string-union alias lowers to a native enum (G6). Comparing an
// enum-typed value against a string LITERAL — `p === 'top'`, the way the
// source is written — has to lower the literal to an enum case, or the
// emit does not compile:
//
//   swiftc  cannot convert value of type 'Position' to expected argument type 'String'
//   kotlinc operator '==' cannot be applied to 'Position' and 'String'
//
// The comparison branch already did this for ONE shape (an enum-typed
// SIGNAL read, `filter()`). Every other shape — a function parameter, a
// struct field, a local — fell through and emitted `p == "top"`.
//
// It went unnoticed because the only in-tree consumer of a union-alias
// enum is the generated chart engine, which DECLARES two (`TreeOrient`,
// `GanttTickUnit`) and compares against neither: the phantom-capability
// shape, a lowering that ships complete with no import path reaching it.
// `@pyreon/flow`'s geometry (`Position`) is the first real consumer.
//
// KNOWN RESIDUAL — a local bound from a struct field.
// `const s = node.sourcePosition; if (s === 'top')` still emits a raw string
// on both targets. The cause is one level down and is NOT specific to enums:
// `buildInferenceCtx`'s struct table is built PER COMPONENT, so a file of pure
// top-level helpers infers `node.sourcePosition` as `unknown`, and the local is
// seeded from that. The comparison branch's own fallback reaches a member read
// directly (`a.side === 'left'`, covered below) but cannot recover a local
// already recorded as unknown.
//
// Seeding a file-scope ctx fixes it and was measured: it removes a batch of
// redundant `Double(...)` wraps from the generated chart engine (good) and ALSO
// stops two of its sites compiling, because better operand types change which
// Int×Double coercions fire. That is a separate change with its own drift
// review, not a rider on a correctness fix.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwift } from '../validate'

/** Every enum-typed operand shape, in both operand positions. */
const SRC = `
type Position = 'top' | 'right' | 'bottom' | 'left'
interface Anchor { side: Position; x: number }

function fromParam(p: Position): number {
  if (p === 'top') { return 1 }
  return 0
}
function literalOnTheLeft(p: Position): number {
  if ('right' === p) { return 1 }
  return 0
}
function fromField(a: Anchor): number {
  if (a.side !== 'left') { return 1 }
  return 0
}
`

describe('enum-aware comparison — Swift', () => {
  const { code, warnings } = transform(SRC, { target: 'swift' })

  it('emits the enum declaration', () => {
    expect(code).toContain('enum Position: String, Codable {')
  })

  it('lowers a literal compared against a PARAMETER', () => {
    expect(code).toContain('if p == .top {')
  })

  it('lowers a literal on the LEFT of the comparison', () => {
    expect(code).toContain('if .right == p {')
  })

  it('lowers a literal compared against a struct FIELD', () => {
    expect(code).toContain('if a.side != .left {')
  })

  it('never leaves a raw string on either side of an enum comparison', () => {
    expect(code).not.toMatch(/[=!]= "(top|right|bottom|left)"/)
    expect(code).not.toMatch(/"(top|right|bottom|left)" [=!]=/)
  })

  it.runIf(isSwiftcAvailable())('compiles', () => {
    const r = validateSwift(code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('enum-aware comparison — Kotlin', () => {
  const { code } = transform(SRC, { target: 'kotlin' })

  it('emits the enum declaration', () => {
    expect(code).toContain('enum class Position {')
  })

  it('lowers every operand shape to a qualified case', () => {
    expect(code).toContain('if (p == Position.top) {')
    expect(code).toContain('if (Position.right == p) {')
    expect(code).toContain('if (a.side != Position.left) {')
  })

  it('never leaves a raw string on either side of an enum comparison', () => {
    expect(code).not.toMatch(/[=!]= "(top|right|bottom|left)"/)
    expect(code).not.toMatch(/"(top|right|bottom|left)" [=!]=/)
  })

  it.runIf(isKotlincAvailable())('compiles', () => {
    const r = validateKotlin(code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('the rewrite is scoped to enum comparisons', () => {
  it('leaves an ordinary string comparison alone', () => {
    const src = `
      type Position = 'top' | 'right'
      function byName(name: string): number {
        if (name === 'top') { return 1 }
        return 0
      }
    `
    for (const target of ['swift', 'kotlin'] as const) {
      const { code } = transform(src, { target })
      expect(code).toContain('"top"')
      expect(code).not.toContain('.top')
    }
  })
})
