// Top-level non-component HELPER function (`function dbl(x: number) { return
// x * 2 }`) — was a silent MIS-EMIT → now a NAMED warning + skip.
//
// `tryComponentFromTopLevel` runs for EVERY top-level `FunctionDeclaration`
// with no "is this a component?" gate, so a pure-logic helper (or a custom
// hook — CLAUDE.md's L1 "shared pure logic" layer) was misclassified as a UI
// component and emitted as a broken `struct dbl: View { x * 2 }` — its value
// params dropped, the body referencing an unbound name — which swiftc/kotlinc
// reject with a cryptic `cannot find 'x' in scope`, with ZERO warning. PMTC
// does not emit standalone helper functions yet (a tracked follow-up: they map
// to Swift `func` / Kotlin `fun` but need typed-param emission + Kotlin
// call-site numeric coercion). Until then it NAMED-warns + skips.
//
// The discriminator is `returnContainsJsx(returnExpr)` — a COMPONENT's return
// resolves to JSX (directly, or nested through a ternary / `&&` / `||` / `??` /
// parens); a helper's never does. The recursion is the false-positive guard: a
// `cond ? <A/> : <B/>` conditional-root component (and a `cond && <JSX>` one)
// MUST still be classified as a component, not a helper.
//
// Bisect-verified by reverting the `returnContainsJsx` check — helpers silently
// mis-emit again and the warning disappears.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const HDR = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'`

const hasHelperWarn = (ws: readonly string[] | undefined): boolean =>
  (ws ?? []).some((w) => w.includes('looks like a helper function'))

describe('top-level helper function — NAMED warning + skip (was a silent mis-emit as a broken view)', () => {
  // The gate is NARROW: warn only a function that takes VALUE PARAMETERS and
  // returns NO JSX — a function OF ITS INPUTS. This is what distinguishes a
  // real helper (`dbl(x)`) from the no-param `function C() { … return out }`
  // test-harness / component-returning-a-value shape (which must NOT warn).
  for (const [name, src] of [
    [
      'plain fn-decl helper (1 value param)',
      `${HDR}
function dbl(x: number): number { return x * 2 }
export function App(){ const g = computed(() => dbl(21)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
    ],
    [
      'generic fn-decl helper (1 value param)',
      `${HDR}
function first<T>(xs: T[]): T { return xs[0] }
export function App(){ const g = computed(() => first([1, 2, 3])); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
    ],
    [
      'helper with a value param returning a ternary of VALUES (no JSX)',
      `${HDR}
function pick(c: boolean){ return c ? "a" : "b" }
export function App(){ return (<Stack><Text>hi</Text></Stack>) }`,
    ],
  ] as const) {
    it(`${name} warns NAMED + is skipped, on both targets`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(
          hasHelperWarn(out.warnings),
          `${target}: ${JSON.stringify(out.warnings)}`,
        ).toBe(true)
      }
    })
  }

  // Guard: neither a real component (return resolves to JSX) NOR a no-param
  // value-returning function (the test-harness shape) may be flagged.
  for (const [name, src] of [
    [
      'component — bare element root',
      `${HDR}
export function App(){ return (<Stack><Text>hi</Text></Stack>) }`,
    ],
    [
      'component — ternary-of-JSX root (cond ? <A/> : <B/>)',
      `${HDR}
function Card(props: { on: boolean }){ return props.on ? (<Text>on</Text>) : (<Text>off</Text>) }
export function App(){ return (<Stack><Card on={true}/></Stack>) }`,
    ],
    [
      'component — &&-of-JSX root (cond && <A/>)',
      `${HDR}
function Maybe(props: { show: boolean }){ return props.show && (<Text>x</Text>) }
export function App(){ return (<Stack><Maybe show={true}/></Stack>) }`,
    ],
    [
      'component — PascalCase, returns JSX',
      `${HDR}
function Helper(){ return (<Text>hi</Text>) }
export function App(){ return (<Stack><Helper/></Stack>) }`,
    ],
    [
      'NO-PARAM function returning a value (test-harness shape — must NOT warn)',
      `${HDR}
export function C(){ const n = signal(1234.5); const out = computed(() => n() * 2); return out }`,
    ],
    [
      'NO-PARAM hook returning a value (deliberate false-negative — must NOT warn)',
      `${HDR}
function useThing(){ return 42 }
export function App(){ return (<Stack><Text>hi</Text></Stack>) }`,
    ],
  ] as const) {
    it(`control — ${name} does NOT warn`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = transform(src, { target })
        expect(
          hasHelperWarn(out.warnings),
          `${target}: ${JSON.stringify(out.warnings)}`,
        ).toBe(false)
      }
    })
  }

  it('the no-param value-returning harness still EMITS (not skipped — emit unchanged)', () => {
    // The narrow gate must leave the `function C(){ … return out }` harness
    // shape emitting exactly as before — this is the 106-test-failure guard.
    const src = `${HDR}
export function C(){ const n = signal(1234.5); const out = computed(() => n() * 2); return out }`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('struct C')
  })

  it('the param-taking helper does not emit a broken `struct dbl: View`', () => {
    const src = `${HDR}
function dbl(x: number): number { return x * 2 }
export function App(){ const g = computed(() => dbl(21)); return (<Stack><Text>{String(g())}</Text></Stack>) }`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).not.toContain('struct dbl')
    const kt = transform(src, { target: 'kotlin' })
    expect(kt.code).not.toContain('fun dbl(')
  })
})
