// Shape A — top-level pure-logic HELPER functions emitted as native file-scope
// functions (Swift `func` / Kotlin `fun`), the fundamentally-correct fix for
// the silent mis-emit #2090 only WARNED about.
//
// A `function dbl(x: number): number { return x * 2 }` used at
// `computed(() => dbl(21))` now emits a real `func dbl(_ x: Int) -> Int` at
// file scope, and the computed infers `Int` (was `Any` → `String(dbl(21))`
// failed swiftc). Reuses the same `emitSwiftFunction` / `emitKotlinFunction`
// store methods use.
//
// v1 SCOPE (deferred shapes keep a NAMED warning — never a broken emit, so no
// regression from #2090):
//   - GENERIC helpers (`function first<T>(…)`) — the IR can't represent `<T>`.
//   - NO return-type annotation — the native signature needs the return type.
//   - FRACTIONAL body (a non-integer literal / division / `Math.*`) — the
//     `number`→Int param + Int-return emit is a Double mismatch inside the
//     body that needs Int×Double coercion threaded into the helper body.
//
// Bisect-verified by reverting the `helperReturns` wiring (the Swift call-site
// inference degrades back to `Any`).

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
  (ws ?? []).some((w) => /helper function/.test(w))

// Each emitted-helper case: (name, source, a substring the emit must contain).
const EMITTED = [
  [
    'int helper',
    `${HDR}
function dbl(x: number): number { return x * 2 }
export function App(){ const g = computed(() => dbl(21)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
  ],
  [
    'array-param helper',
    `${HDR}
function first(xs: number[]): number { return xs[0] }
export function App(){ const g = computed(() => first([1, 2, 3])); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
  ],
  [
    'string helper',
    `${HDR}
function greet(name: string): string { return "hi " + name }
export function App(){ const g = computed(() => greet("bob")); return (<Stack><Text>{g()}</Text></Stack>) }`,
  ],
  [
    'bool + ternary helper',
    `${HDR}
function pick(c: boolean): string { return c ? "a" : "b" }
export function App(){ const g = computed(() => pick(true)); return (<Stack><Text>{g()}</Text></Stack>) }`,
  ],
  [
    'multi-statement helper',
    `${HDR}
function clamp(x: number): number { if (x < 0) { return 0 } return x }
export function App(){ const g = computed(() => clamp(-3)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
  ],
] as const

describe('helper-function emission — file-scope func/fun (was a silent mis-emit / #2090 warn)', () => {
  for (const [name, src] of EMITTED) {
    it(`${name} emits a native function on both targets + does NOT warn`, () => {
      const sw = transform(src, { target: 'swift' })
      expect(sw.code).toMatch(/\bfunc (dbl|first|greet|pick|clamp)\b/)
      expect(hasHelperWarn(sw.warnings), JSON.stringify(sw.warnings)).toBe(false)
      const kt = transform(src, { target: 'kotlin' })
      expect(kt.code).toMatch(/\bfun (dbl|first|greet|pick|clamp)\b/)
      expect(hasHelperWarn(kt.warnings), JSON.stringify(kt.warnings)).toBe(false)
    })
  }

  it('a helper call infers the helper return type (Swift computed is Int, not Any)', () => {
    const [, src] = EMITTED[0]! // int helper `dbl`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('private var g: Int')
    expect(sw.code).not.toContain('private var g: Any')
  })

  // Deferred shapes: keep a NAMED warning, are NOT emitted (no regression).
  for (const [name, src, marker] of [
    [
      'GENERIC helper',
      `${HDR}
function firstT<T>(xs: T[]): T { return xs[0] }
export function App(){ const g = computed(() => firstT([1, 2, 3])); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
      'firstT',
    ],
    [
      'FRACTIONAL body helper',
      `${HDR}
function scale(x: number): number { return x * 1.5 }
export function App(){ const g = computed(() => scale(4)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
      'scale',
    ],
    // NOTE: a helper with NO return annotation used to be deferred here; the
    // infer-return-from-body follow-up now EMITS it (its return type is
    // inferred from the body) — see native-helper-infer-return.test.ts.
  ] as const) {
    it(`${name} keeps a NAMED warning and is NOT emitted, on both targets`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(hasHelperWarn(out.warnings), `${target}: ${JSON.stringify(out.warnings)}`).toBe(
          true,
        )
        // Not emitted as a native function.
        expect(out.code).not.toMatch(new RegExp(`\\b(func|fun) ${marker}\\b`))
      }
    })
  }

  // No-param `function C(){ … return out }` harness (the #2090 106-test shape)
  // is UNaffected — it emits as a component, not a helper.
  it('a no-param value-returning function still emits as a component (not a helper)', () => {
    const src = `${HDR}
export function C(){ const n = signal(1234.5); const out = computed(() => n() * 2); return out }`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('struct C')
    expect(hasHelperWarn(sw.warnings)).toBe(false)
  })

  // Classification guards (the `returnContainsJsx` discriminator, carried over
  // from the #2090 warn spec Shape A supersedes): a COMPONENT whose return
  // resolves to JSX — directly or through a `cond ? <A/> : <B/>` / `&&` root —
  // must NEVER be treated as a helper (neither warned nor emitted as a `func`).
  for (const [name, src] of [
    [
      'ternary-of-JSX root component',
      `${HDR}
function Card(props: { on: boolean }){ return props.on ? (<Text>on</Text>) : (<Text>off</Text>) }
export function App(){ return (<Stack><Card on={true}/></Stack>) }`,
    ],
    [
      '&&-of-JSX root component',
      `${HDR}
function Maybe(props: { show: boolean }){ return props.show && (<Text>x</Text>) }
export function App(){ return (<Stack><Maybe show={true}/></Stack>) }`,
    ],
  ] as const) {
    it(`control — ${name} is classified as a component (no helper warning)`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(hasHelperWarn(out.warnings), `${target}: ${JSON.stringify(out.warnings)}`).toBe(
          false,
        )
      }
      // Swift emits a component as a `struct … : View` (not a bare `func`);
      // that it's a View struct proves it wasn't misclassified as a helper.
      const sw = transform(src, { target: 'swift' })
      expect(sw.code).toMatch(/struct (Card|Maybe): View/)
    })
  }

  describe.skipIf(!isSwiftUIAvailable())('swiftc-typechecks the emitted helpers', () => {
    for (const [name, src] of EMITTED) {
      it(`${name}`, () => {
        const r = validateSwiftTypecheck(transform(src, { target: 'swift' }).code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc-typechecks the emitted helpers', () => {
    for (const [name, src] of EMITTED) {
      it(`${name}`, () => {
        const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })
})
