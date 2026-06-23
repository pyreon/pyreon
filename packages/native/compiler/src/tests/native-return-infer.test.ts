// Swift function return-type inference (correctness widening).
//
// A value-returning helper declared WITHOUT a `: T` return annotation
// (`const dbl = (x: number) => x * 2`) emitted a Swift Void function
// (`func dbl(_ x: Int) { x * 2 }`) — `swiftc -parse` accepts it, but a real
// build drops the result + the call (`dbl(3)`) is `Void`, an error wherever
// it's used as a value. Now the return type is INFERRED from the body's
// return expr (params bound as locals) and emitted as `-> T`:
//
//   (x: number) => x * 2      -> func dbl(_ x: Int) -> Int { x * 2 }
//   (name: string) => 'Hi '+n -> func greet(_ name: String) -> String { … }
//
// Inference returns `unknown` when unsure (no annotation — the prior
// behavior; a wrong guess is impossible). Void helpers (no value return) stay
// annotation-less. KOTLIN's concise `= expr` form already infers natively, so
// this is a Swift-only annotation fix; a Kotlin block-body value-return
// without an annotation remains a narrow documented gap (annotate the return).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwift } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('Swift function return-type inference', () => {
  it('infers Int / String / Bool return types for value-returning helpers', () => {
    const out = transform(
      app(`  const dbl = (x: number) => x * 2
  const greet = (name: string) => "Hi " + name
  const flag = (n: number) => n > 0`),
      { target: 'swift' },
    ).code
    expect(out).toContain('func dbl(_ x: Int) -> Int { x * 2 }')
    expect(out).toContain('func greet(_ name: String) -> String')
    expect(out).toContain('func flag(_ n: Int) -> Bool')
  })

  it('infers the return type of a block-body value-returning function', () => {
    const out = transform(
      app(`  const calc = (x: number) => { const y = x * 2; return y }`),
      { target: 'swift' },
    ).code
    expect(out).toContain('func calc(_ x: Int) -> Int {')
  })

  it('a void helper (no value return) stays annotation-less (Void)', () => {
    const out = transform(app(`  const noop = (n: number) => { log(n) }`), { target: 'swift' }).code
    expect(out).toContain('func noop(_ n: Int) {')
    expect(out).not.toContain('func noop(_ n: Int) ->')
  })

  it('an explicit return annotation is preserved (no inference override)', () => {
    const out = transform(app(`  const half = (x: number): number => x / 2`), { target: 'swift' }).code
    // declared `: number` → Double? no — `/` infers Double; but the DECLARED
    // annotation wins. `number` → Int by default.
    expect(out).toContain('func half(_ x: Int) -> Int')
  })

  it('a destructured-param value-return now infers via the struct registry', () => {
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
type P = { x: number; y: number }
function App() {
  const sum = ({ x, y }: P) => x + y
  return (<Stack><Text>x</Text></Stack>)
}`,
      { target: 'swift' },
    ).code
    // The synthetic `__p0.x` / `__p0.y` member reads now resolve through the
    // struct registry (`type P` is threaded into the inference ctx), so
    // `x + y` infers `Int` and the helper's return is annotated `-> Int`.
    // Previously a documented limit (no annotation) — closed by the
    // typeRef-member struct-field resolution.
    expect(out).toContain('private func sum(_ __p0: P) -> Int {')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: inferred-return helpers typecheck via swiftc', () => {
    const out = transform(
      app(`  const dbl = (x: number) => x * 2
  const greet = (name: string) => "Hi " + name
  const flag = (n: number) => n > 0
  const calc = (x: number) => { const y = x * 2; return y }`),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
