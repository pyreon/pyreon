// Multi-declarator variable statements (`const a = 1, b = 2`) — subset widening.
//
// A single `const`/`let` with multiple declarators previously bailed
// ("Unsupported statement: multi-declarator VariableDeclaration") and DROPPED
// every binding. Neither Swift nor Kotlin has a combined-declarator form, so
// the lowering is a 1:N split — one `let`/`val` per binding, re-parsed through
// the existing single-declarator path so every supported init shape carries
// over:
//
//   const a = 1, b = 2, c = a + b
//     → Swift   let a = 1 / let b = 2 / let c = a + b
//     → Kotlin  val a = 1 / val b = 2 / val c = a + b
//
// Verification rungs (honest):
//  - Kotlin: full `kotlinc` semantic typecheck.
//  - Swift: `swiftc -parse` (the harness rung) + emit-shape.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('multi-declarator variable statements', () => {
  it('splits a multi-declarator into one decl per binding (both targets)', () => {
    const body = `  const f = () => { const a = 1, b = 2, c = a + b; return c }`
    const sw = transform(app(body), { target: 'swift' }).code
    expect(sw).toContain('let a = 1')
    expect(sw).toContain('let b = 2')
    expect(sw).toContain('let c = a + b')
    expect(sw).not.toContain('multi-declarator')
    const kt = transform(app(body), { target: 'kotlin' }).code
    expect(kt).toContain('val a = 1')
    expect(kt).toContain('val b = 2')
    expect(kt).toContain('val c = a + b')
  })

  it('no warning is emitted for a multi-declarator (was: dropped + warned)', () => {
    const body = `  const f = () => { const a = 1, b = 2; return a + b }`
    const r = transform(app(body), { target: 'swift' })
    expect(r.warnings.some((w) => w.includes('multi-declarator'))).toBe(false)
  })

  it.skipIf(!isSwiftcAvailable())('Swift: split decls parse via swiftc -parse', () => {
    const out = transform(
      app(`  const f = () => { const a = 1, b = 2, c = a + b; return c }`),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: split decls typecheck via kotlinc', () => {
    const out = transform(
      app(`  const total = computed(() => { const a = 1, b = 2, c = a + b; return c })`),
      { target: 'kotlin' },
    ).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
