// Shape-A follow-up (A) — a top-level helper function with a FRACTIONAL body
// (`function scale(x: number) { return x * 1.5 }`) now EMITS. Two earlier PRs
// (#2091 emission, #2093 return-inference) deferred it with a NAMED warning
// because a `number` param maps to `Int` and Swift has no implicit Int→Double,
// so `x * 1.5` on an Int param was an uncompilable body + the Int-return
// annotation mismatched the Double body.
//
// This closes it with two pieces:
//   1. `refineHelperReturns` (parse.ts) re-infers a `number`-typed return from
//      the body, so a fractional body refines the return `Int` → `Double`.
//   2. `emitSwiftFunction` (emit-swift.ts) seeds the helper's Int params into
//      the coercion ctx (`_activeInferCtx.locals`, the same the element-callback
//      coercion uses) while emitting the body, so `x * 1.5` → `Double(x) * 1.5`.
// Kotlin auto-promotes Int×Double, so it needs only the Double return (piece 1,
// target-independent).
//
// Bisect-verified by reverting the param-seeding in emitSwiftFunction — Swift
// fractional bodies stop typechecking (`x * 1.5` on an Int param).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const HDR = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'`

const hasHelperWarn = (ws: readonly string[] | undefined): boolean =>
  (ws ?? []).some((w) => w.includes('helper function'))

// (name, source, emitted-fn-name) — helpers with a fractional body.
const CASES = [
  [
    'multiplication x * 1.5 (annotated : number)',
    `${HDR}
function scale(x: number): number { return x * 1.5 }
export function App(){ const g = computed(() => scale(4)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
    'scale',
  ],
  [
    'multiplication (un-annotated — return inferred Double)',
    `${HDR}
function scale2(x: number) { return x * 1.5 }
export function App(){ const g = computed(() => scale2(4)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
    'scale2',
  ],
  [
    'division x / 2 (JS-fractional, not integer division)',
    `${HDR}
function half(x: number): number { return x / 2 }
export function App(){ const g = computed(() => half(9)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
    'half',
  ],
  [
    'Math.sqrt(x)',
    `${HDR}
function rt(x: number): number { return Math.sqrt(x) }
export function App(){ const g = computed(() => rt(9)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
    'rt',
  ],
] as const

describe('helper functions with a fractional body — Int×Double body coercion + Double return', () => {
  for (const [name, src, fn] of CASES) {
    it(`${name}: emits on both targets + no warning`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(out.code).toMatch(new RegExp(`\\b(func|fun) ${fn}\\b`))
        expect(hasHelperWarn(out.warnings), `${target}: ${JSON.stringify(out.warnings)}`).toBe(
          false,
        )
      }
    })
  }

  it('Swift emits a Double return + the body coerces the Int param (Double(x) …)', () => {
    const [, src] = CASES[0]! // scale
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toMatch(/func scale\(_ x: Int\) -> Double/)
    expect(sw.code).toContain('Double(x)')
    // the consuming computed annotates Double, not Any
    expect(sw.code).toContain('private var g: Double')
  })

  it('division lowers to Double division (4.5), not integer division (4)', () => {
    const [, src] = CASES[2]! // half
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toMatch(/Double\(x\) \/ Double\(2\)/)
  })

  it('a NON-fractional helper still returns Int (no over-widening regression)', () => {
    const src = `${HDR}
function dbl(x: number): number { return x * 2 }
export function App(){ const g = computed(() => dbl(21)); return (<Stack><Text>{String(g())}</Text></Stack>) }`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toMatch(/func dbl\(_ x: Int\) -> Int/)
    expect(sw.code).not.toContain('Double(x)')
  })

  describe.skipIf(!isSwiftUIAvailable())('swiftc-typechecks the fractional emit', () => {
    for (const [name, src] of CASES) {
      it(`${name}`, () => {
        const r = validateSwiftTypecheck(transform(src, { target: 'swift' }).code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc-typechecks the fractional emit', () => {
    for (const [name, src] of CASES) {
      it(`${name}`, () => {
        const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })
})
