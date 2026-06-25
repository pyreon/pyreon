// Component-PROPS param destructuring — `function Row({ label, count }: {
// label: string; count: number })`, the dominant real-component signature.
// Distinct from the helper-function/arrow param destructure (synthetic
// `__pN` + prelude lets, see native-param-destructure.test.ts): a COMPONENT's
// props param maps each destructured key to a PROP (Swift struct field /
// Compose param), and the body references them BARE.
//
// `parseProps` bailed on a non-Identifier first param (ObjectPattern), so the
// props were never enumerated → the destructured locals were unbound →
// swiftc TYPE error (`-parse` misses it). Now it enumerates props from the
// destructured param's type annotation; the body's bare `label` resolves to
// the emitted field/param with no rewrite. Only the simple no-rename shape
// maps cleanly — a rename (`{ label: lbl }`) bails (would need aliasing).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isSwiftcAvailable,
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateSwift,
  validateSwiftTypecheck,
  validateKotlin,
} from '../validate'

const SRC = `import { Stack, Text } from '@pyreon/primitives'
function Row({ label, count }: { label: string; count: number }) {
  return (<Stack><Text>{label}</Text><Text>{String(count)}</Text></Stack>)
}
function App() {
  return (<Stack><Row label="hi" count={3} /></Stack>)
}`

describe('component-props param destructuring', () => {
  it('Swift: destructured props become struct fields; body refs resolve bare', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('let label: String')
    expect(out).toContain('let count: Int')
    expect(out).toContain('Text("\\(label)")') // bare `label` reference resolves (interpolated)
  })

  it('Kotlin: destructured props become composable params', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('label: String')
    expect(out).toContain('count: Int')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift parses on real swiftc', () => {
    const r = validateSwift(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: before the fix the destructured props were unbound
  // → swiftc TYPE error (`-parse` misses it).
  it.skipIf(!isSwiftUIAvailable())('TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('compiles via kotlinc', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
