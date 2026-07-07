// Shape-A follow-up (B) — a top-level helper function declared WITHOUT an
// explicit `: T` return annotation now EMITS: its return type is inferred from
// the body (`refineHelperReturns` in parse.ts, via `inferReturnType` — the same
// util `emitSwiftFunction` / `emitKotlinFunction` already use for un-annotated
// function signatures). This drops the v1 annotation requirement from the
// initial helper-emission PR (#2091), where an un-annotated helper was warned +
// skipped.
//
// The inferred return type reaches BOTH the emit signature AND the call-site
// `helperReturns` registry (built from `helperFns[].returnType`), so a Swift
// computed over the call annotates the real type, not `Any`.
//
// A body whose type still can't be inferred (an untyped param the return
// depends on, an exotic shape) keeps a NAMED warning and is DROPPED — never a
// signature-less broken `func`.
//
// Bisect-verified by reverting the `refineHelperReturns` call — un-annotated
// helpers stop emitting (no `func`/`fun`, no call-site inference).

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

const hasInferWarn = (ws: readonly string[] | undefined): boolean =>
  (ws ?? []).some((w) => w.includes("return type couldn't be inferred"))

// (name, source, emitted-fn-name) — helpers with NO return annotation.
const EMITTED = [
  [
    'int body → inferred Int',
    `${HDR}
function dbl(x: number) { return x * 2 }
export function App(){ const g = computed(() => dbl(21)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
    'dbl',
  ],
  [
    'string body → inferred String',
    `${HDR}
function greet(name: string) { return "hi " + name }
export function App(){ const g = computed(() => greet("bob")); return (<Stack><Text>{g()}</Text></Stack>) }`,
    'greet',
  ],
  [
    'ternary-of-strings body → inferred String',
    `${HDR}
function pick(c: boolean) { return c ? "a" : "b" }
export function App(){ const g = computed(() => pick(true)); return (<Stack><Text>{g()}</Text></Stack>) }`,
    'pick',
  ],
] as const

describe('helper return-type inference from body — drops the annotation requirement', () => {
  for (const [name, src, fn] of EMITTED) {
    it(`${name}: emits a native function on both targets + no warning`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(out.code).toMatch(new RegExp(`\\b(func|fun) ${fn}\\b`))
        expect(hasInferWarn(out.warnings), JSON.stringify(out.warnings)).toBe(false)
      }
    })
  }

  it('call-site inference works for an un-annotated helper (Swift computed is Int, not Any)', () => {
    const [, src] = EMITTED[0]! // un-annotated `dbl` with an int body
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('private var g: Int')
    expect(sw.code).not.toContain('private var g: Any')
  })

  it('an un-inferable body (untyped param) keeps a NAMED warning + is dropped', () => {
    // `x` has no type annotation → the returned `x` infers `unknown` → the
    // refine pass can't type the return → warn + drop (never a broken func).
    const src = `${HDR}
function f(x) { return x }
export function App(){ const g = computed(() => f(3)); return (<Stack><Text>{String(g())}</Text></Stack>) }`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(src, { target })
      expect(hasInferWarn(out.warnings), `${target}: ${JSON.stringify(out.warnings)}`).toBe(true)
      expect(out.code).not.toMatch(/\b(func|fun) f\b/)
    }
  })

  it('an explicit return annotation still works (regression)', () => {
    const src = `${HDR}
function dbl2(x: number): number { return x * 2 }
export function App(){ const g = computed(() => dbl2(21)); return (<Stack><Text>{String(g())}</Text></Stack>) }`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toMatch(/\bfunc dbl2\b/)
    expect(sw.code).toContain('private var g: Int')
  })

  describe.skipIf(!isSwiftUIAvailable())('swiftc-typechecks the inferred-return emit', () => {
    for (const [name, src] of EMITTED) {
      it(`${name}`, () => {
        const r = validateSwiftTypecheck(transform(src, { target: 'swift' }).code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc-typechecks the inferred-return emit', () => {
    for (const [name, src] of EMITTED) {
      it(`${name}`, () => {
        const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })
})
