// Shape-A follow-up — a top-level ARROW-CONST helper
// (`const dbl = (x: number) => x * 2`) now EMITS as a native `func` / `fun`,
// the same as the `function dbl(){}` helper form. Before this it fell through
// to the module-decl path and emitted a mis-scoped `private let dbl = { x in
// x * 2 }` closure + `Any` inference — silent, uncompilable (the arrow-const
// form of the #2091 silent-mis-emit class).
//
// `tryHelperFnFromArrowConst` (parse.ts) routes a single-declarator
// `const <name> = <arrow>` with value params + a non-JSX return into
// `ctx.helperFns` (reusing `tryFunctionDecl`, which already accepts the arrow
// shape), so the shared helper emission + `refineHelperReturns` (return
// inference) + the Int×Double body coercion all apply automatically.
//
// Falls through UNCHANGED for: a JSX-returning arrow (an arrow-const
// COMPONENT — a separate pre-existing gap), a no-param arrow, a non-arrow
// const (`const APP = '1.0'`), and a multi-declarator const.
//
// Bisect-verified by reverting the `tryHelperFnFromArrowConst` route — the
// arrow-const reverts to the mis-scoped `private let` closure + `Any`.

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

// (name, source, emitted-fn-name)
const EMITTED = [
  [
    'annotated arrow-const',
    `${HDR}
const dbl = (x: number): number => x * 2
export function App(){ const g = computed(() => dbl(21)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
    'dbl',
  ],
  [
    'un-annotated arrow-const (return inferred)',
    `${HDR}
const dbl2 = (x: number) => x * 2
export function App(){ const g = computed(() => dbl2(21)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
    'dbl2',
  ],
  [
    'fractional arrow-const (Int×Double coercion)',
    `${HDR}
const scale = (x: number) => x * 1.5
export function App(){ const g = computed(() => scale(4)); return (<Stack><Text>{String(g())}</Text></Stack>) }`,
    'scale',
  ],
  [
    'export const arrow (string)',
    `${HDR}
export const greet = (n: string): string => "hi " + n
export function App(){ const g = computed(() => greet("x")); return (<Stack><Text>{g()}</Text></Stack>) }`,
    'greet',
  ],
] as const

describe('arrow-const top-level helper — emits as a native func/fun (was a silent mis-emit)', () => {
  for (const [name, src, fn] of EMITTED) {
    it(`${name}: emits a native function on both targets`, () => {
      const sw = transform(src, { target: 'swift' })
      expect(sw.code).toMatch(new RegExp(`\\bfunc ${fn}\\b`))
      // NOT the old mis-scoped closure.
      expect(sw.code).not.toMatch(new RegExp(`let ${fn} = \\{`))
      const kt = transform(src, { target: 'kotlin' })
      expect(kt.code).toMatch(new RegExp(`\\bfun ${fn}\\b`))
    })
  }

  it('the call-site computed infers Int (not Any) for an arrow-const helper', () => {
    const [, src] = EMITTED[0]! // dbl
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('private var g: Int')
    expect(sw.code).not.toContain('private var g: Any')
  })

  // Guards: these fall through UNCHANGED (not routed as helper funcs).
  it('a JSX-returning arrow (component) is NOT routed as a helper', () => {
    const src = `${HDR}
const Card = (p: { x: string }) => (<Text>{p.x}</Text>)
export function App(){ return (<Stack><Text>hi</Text></Stack>) }`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).not.toMatch(/\bfunc Card\b/)
  })

  it('a plain module const (non-arrow) is unaffected — stays a let/val', () => {
    const src = `${HDR}
const APP = "1.0"
export function App(){ return (<Stack><Text>{APP}</Text></Stack>) }`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).not.toMatch(/\bfunc APP\b/)
    expect(sw.code).toMatch(/let APP/)
  })

  it('a NO-param arrow-const is NOT routed as a helper', () => {
    const src = `${HDR}
const factory = () => 42
export function App(){ return (<Stack><Text>hi</Text></Stack>) }`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).not.toMatch(/\bfunc factory\b/)
  })

  describe.skipIf(!isSwiftUIAvailable())('swiftc-typechecks the arrow-const emit', () => {
    for (const [name, src] of EMITTED) {
      it(`${name}`, () => {
        const r = validateSwiftTypecheck(transform(src, { target: 'swift' }).code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc-typechecks the arrow-const emit', () => {
    for (const [name, src] of EMITTED) {
      it(`${name}`, () => {
        const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
        expect(r.ok, r.error?.slice(0, 300)).toBe(true)
      })
    }
  })
})
