// Destructured function/arrow parameter lowering (subset widening).
//
// `const fn = ({ a, b }: T) => …` was DROPPED (the param loop skipped any
// non-Identifier param), so a helper with a destructured param produced a
// function with the param missing + every reference unbound. Now it lowers
// like the hook-result destructure: synthesize a positional param `__pN`
// (typed from the pattern's annotation — a named type resolves to the
// declared struct) + PREPEND `let a = __pN.a` per key to the body. The body
// then references `a`/`b` exactly as written.
//
//   Swift  → func fn(_ __p0: T) { let a = __p0.a; … }
//   Kotlin → fun fn(__p0: T) { val a = __p0.a; … }
//
// Works for VOID handlers and functions with an explicit return-type
// annotation. (A value-returning destructured function WITHOUT a return
// annotation hits a separate, pre-existing gap — an unannotated value
// return infers `Unit` on Kotlin — so annotate the return type, e.g.
// `({ x }: P): number => x`.) Rest / nested patterns warn + stay
// un-destructured (the param still emits).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (decls: string, jsx: string) =>
  `import { Stack, Text, Button } from '@pyreon/primitives'
type Point = { x: number; y: number }
function App() {
  const total = signal(0)
${decls}
  return (<Stack>${jsx}</Stack>)
}`

describe('destructured parameter lowering', () => {
  it('Swift: a void handler with a destructured param synthesizes __p0 + prepends lets', () => {
    const out = transform(
      app(
        `  const apply = ({ x, y }: Point) => { total.set(x + y) }`,
        `<Button onPress={() => apply({ x: 1, y: 2 })}>Go</Button>`,
      ),
      { target: 'swift' },
    ).code
    expect(out).toContain('private func apply(_ __p0: Point) {')
    expect(out).toContain('let x = __p0.x')
    expect(out).toContain('let y = __p0.y')
  })

  it('Kotlin: a void handler with a destructured param synthesizes __p0 + prepends vals', () => {
    const out = transform(
      app(
        `  const apply = ({ x, y }: Point) => { total.set(x + y) }`,
        `<Button onPress={() => apply({ x: 1, y: 2 })}>Go</Button>`,
      ),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('fun apply(__p0: Point) {')
    expect(out).toContain('val x = __p0.x')
    expect(out).toContain('val y = __p0.y')
  })

  it('an explicit return-type annotation carries through (value-returning)', () => {
    const sw = transform(
      app(`  const dist = ({ x, y }: Point): number => x + y`, `<Text>{dist({ x: 1, y: 2 })}</Text>`),
      { target: 'swift' },
    ).code
    const kt = transform(
      app(`  const dist = ({ x, y }: Point): number => x + y`, `<Text>{dist({ x: 1, y: 2 })}</Text>`),
      { target: 'kotlin' },
    ).code
    expect(sw).toContain('private func dist(_ __p0: Point) -> Int {')
    expect(kt).toContain('fun dist(__p0: Point): Int {')
  })

  it('renamed keys alias to the synthetic param field', () => {
    const sw = transform(
      app(`  const getX = ({ x: px }: Point) => { total.set(px) }`, `<Text>x</Text>`),
      { target: 'swift' },
    ).code
    expect(sw).toContain('let px = __p0.x')
    expect(sw).not.toMatch(/\(px\)|__p0\.px/)
  })

  it('a rest-element pattern warns + leaves the param un-destructured', () => {
    const res = transform(
      app(`  const f = ({ x, ...rest }: Point) => { total.set(x) }`, `<Text>x</Text>`),
      { target: 'swift' },
    )
    // param still emitted (function well-formed)
    expect(res.code).toContain('__p0: Point')
    // but no destructure prelude + a warning
    expect(res.code).not.toContain('let x = __p0.x')
    expect(res.warnings.some((w) => w.includes('rest element') || w.includes('nested pattern'))).toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('Swift: void + annotated-return destructured params typecheck via swiftc', () => {
    const out = transform(
      app(
        `  const apply = ({ x, y }: Point) => { total.set(x + y) }
  const dist = ({ x, y }: Point): number => x + y`,
        `<Button onPress={() => apply({ x: 1, y: 2 })}>Go</Button><Text>{dist({ x: 3, y: 4 })}</Text>`,
      ),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: void + annotated-return destructured params typecheck via kotlinc', () => {
    const out = transform(
      app(
        `  const apply = ({ x, y }: Point) => { total.set(x + y) }
  const dist = ({ x, y }: Point): number => x + y`,
        `<Button onPress={() => apply({ x: 1, y: 2 })}>Go</Button><Text>{dist({ x: 3, y: 4 })}</Text>`,
      ),
      { target: 'kotlin' },
    ).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
