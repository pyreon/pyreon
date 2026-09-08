// Four shapes that PMTC lowered to invalid Swift/Kotlin with NO warning,
// all found by generating `@pyreon/flow`'s edge geometry and then COMPILING
// the result — which the generator's own "zero warnings" precondition had
// reported as clean. That is the lesson these specs exist to hold: a quiet
// transform is necessary, not sufficient, so every case here runs the real
// toolchain rather than asserting on the emitted string alone.
//
//   1. `a?.b?.filter(…)` — the second link was dropped on BOTH targets, so a
//      method call landed on an optional receiver.
//   2. `if (nullableObject)` — Swift emitted the bare optional as a condition.
//      Kotlin was already correct.
//   3. `return 'bottom'` where the return type is an enum — a raw string on
//      both targets. The comparison position was fixed separately; this is the
//      return position.
//   4. a function returning an ANONYMOUS object — Kotlin synthesized two
//      different data classes and returned the wrong one. Now a warning, since
//      naming the shape is a one-line source fix and guessing which name wins
//      is not something a compiler should do.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

/**
 * Assert an emit TYPE-checks on whichever toolchains this machine has.
 *
 * `validateSwiftTypecheck`, not `validateSwift`: the latter only asks whether
 * the source PARSES, and every defect in this file is a type error — `if first`
 * on an optional is perfectly good syntax. Using the parse-only validator here
 * would have made the Swift half of each assertion vacuous, which is the same
 * mistake, one level up, as the "zero warnings" precondition these specs exist
 * to correct.
 */
function expectCompiles(src: string): void {
  if (isSwiftUIAvailable()) {
    const r = validateSwiftTypecheck(transform(src, { target: 'swift' }).code)
    expect(r.ok, `swift: ${r.error ?? ''}`).toBe(true)
  }
  if (isKotlincAvailable()) {
    const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
    expect(r.ok, `kotlin: ${r.error ?? ''}`).toBe(true)
  }
}

describe('optional chain through a method call', () => {
  const SRC = `
interface H { id: string; kind: string }
interface M { handles?: H[] }
function countOf(m: M | undefined, kind: string): number {
  const found = m?.handles?.filter((h) => h.kind === kind)
  return found === undefined ? 0 : 1
}
function countOfField(m: M, kind: string): number {
  const found = m.handles?.filter((h) => h.kind === kind)
  return found === undefined ? 0 : 1
}
`
  it('keeps the chain optional on Swift', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).toContain('m?.handles?.filter(')
    expect(code).toContain('m.handles?.filter(')
  })

  it('keeps the chain optional on Kotlin', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code).toContain('m?.handles?.filter(')
    expect(code).toContain('m.handles?.filter(')
  })

  it('compiles', () => expectCompiles(SRC))
})

describe('a nullable object used as a condition', () => {
  const SRC = `
interface H { id: string; w: number }
function widthOfLocal(list: H[]): number {
  const first = list.find((h) => h.id === 'a')
  if (first) { return first.w }
  return 0
}
function widthOfParam(first: H | undefined): number {
  if (first) { return first.w }
  return 0
}
`
  it('binds the optional on Swift rather than testing it as a Bool', () => {
    const { code } = transform(SRC, { target: 'swift' })
    // Two shapes reach this: a local bound from `.find`, and an optional param.
    expect(code.match(/if let first \{/g) ?? []).toHaveLength(2)
    expect(code).not.toContain('if first {')
  })

  it('is unchanged on Kotlin, which was already correct', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code.match(/if \(first != null\) \{/g) ?? []).toHaveLength(2)
  })

  it('compiles', () => expectCompiles(SRC))
})

describe('a string literal returned where the type is an enum', () => {
  const SRC = `
type Side = 'top' | 'bottom'
function sideFor(dy: number): Side {
  if (dy > 0) { return 'bottom' }
  return 'top'
}
`
  it('lowers to a case on Swift', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).toContain('return .bottom')
    expect(code).toContain('return .top')
    expect(code).not.toMatch(/return "(top|bottom)"/)
  })

  it('lowers to a qualified case on Kotlin', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code).toContain('return Side.bottom')
    expect(code).toContain('return Side.top')
    expect(code).not.toMatch(/return "(top|bottom)"/)
  })

  it('compiles', () => expectCompiles(SRC))

  it('leaves a plain string return alone', () => {
    const plain = `
type Side = 'top' | 'bottom'
function nameFor(dy: number): string {
  if (dy > 0) { return 'bottom' }
  return 'top'
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(plain, { target }).code, target).toContain('return "bottom"')
    }
  })
})

describe('a function returning an anonymous object', () => {
  const SRC = `
function pair(a: number, b: number): { lo: number; hi: number } {
  return { lo: a < b ? a : b, hi: a < b ? b : a }
}
`
  it('warns on Kotlin, where the two synthesized data classes disagree', () => {
    const { warnings } = transform(SRC, { target: 'kotlin' })
    expect(warnings.filter((w) => w.includes('ANONYMOUS object type'))).toHaveLength(1)
  })

  it('does not warn on Swift, which emits a valid tuple', () => {
    const { warnings } = transform(SRC, { target: 'swift' })
    expect(warnings).toEqual([])
  })

  it('does not warn once the shape is NAMED — the remedy the warning gives', () => {
    const named = `
interface MinMax { lo: number; hi: number }
function pair(a: number, b: number): MinMax {
  return { lo: a < b ? a : b, hi: a < b ? b : a }
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(named, { target }).warnings, target).toEqual([])
    }
    expectCompiles(named)
  })
})

describe('a struct field typed with an emitted enum', () => {
  // A synthesized Swift struct is emitted `: Codable`, and Swift synthesizes
  // Codable for a RawRepresentable enum only when the ENUM declares it. So a
  // struct holding an enum-typed field failed with "type 'HandleConfig' does
  // not conform to protocol 'Decodable'" — an error naming the struct and
  // pointing nowhere near the enum that caused it.
  const SRC = `
type Side = 'top' | 'bottom'
interface Handle { id: string; side: Side }
function sideOf(h: Handle): Side {
  return h.side
}
`
  it('declares the enum Codable on Swift', () => {
    expect(transform(SRC, { target: 'swift' }).code).toContain('enum Side: String, Codable {')
  })

  it('compiles', () => expectCompiles(SRC))
})
