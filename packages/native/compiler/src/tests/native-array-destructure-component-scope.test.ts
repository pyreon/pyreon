// COMPONENT-scope flat array destructure — `const [a, b] = xs()` in a
// component body — was the last SILENT destructure drop. The helper/computed
// BODY walker expanded it (block-scoped `let __pyDestrN` + indexed lets), and
// the component-level OBJECT arm lowered `const { x, y } = …`, but an
// ArrayPattern at component scope fell through to the name-based bail (an
// ArrayPattern id has no `.name`) and vanished with ZERO warnings — the emit
// then referenced `a`/`b` unbound, failing swiftc/kotlinc with
// "cannot find 'a' in scope" while the transform reported success. Probed and
// reproduced 2026-08-03 against real emit output.
//
// The fix mirrors the object arm: synthesize `const __pyDestrN = <expr>`
// (recursing into the value-const / signal-read path) and alias each element
// to `__pyDestrN[i]` in parseExpr's Identifier case — the exact IR of the
// documented explicit-index shape (`xs()[0]`), so emit and inference ride a
// proven path on both targets. Non-simple patterns (hole / rest / default /
// nested) bail to a LOUD residual warning that now also covers the previously
// silent non-simple component-level OBJECT patterns.

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

const SKIP_SLOW = process.env.PYREON_SKIP_SLOW_TESTS === '1'

// ONE source for the compile gates (single swiftc/kotlinc invocation — the
// per-shape-loop form blows the test timeout under full-suite load).
const FLAT = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const xs = signal<number[]>([10, 20, 30])
  const [a, b] = xs()
  return (<Stack><Text>{String(a + b)}</Text></Stack>)
}`

describe('component-scope flat array destructure lowers (was a silent drop)', () => {
  it('Swift: container + indexed reads emit, zero warnings', () => {
    const { code, warnings } = transform(FLAT, { target: 'swift' })
    expect(warnings).toEqual([])
    expect(code).toContain('__pyDestr')
    // The destructured locals rewrite to indexed reads off the container —
    // NOT bare `a`/`b` references (the pre-fix unbound-identifier emit).
    expect(code).toMatch(/__pyDestr\d+\[0\]/)
    expect(code).toMatch(/__pyDestr\d+\[1\]/)
    expect(code).not.toMatch(/\ba \+ b\b/)
  })

  it('Kotlin: container + indexed reads emit, zero warnings', () => {
    const { code, warnings } = transform(FLAT, { target: 'kotlin' })
    expect(warnings).toEqual([])
    expect(code).toContain('__pyDestr')
    expect(code).toMatch(/__pyDestr\d+\[0\]/)
    expect(code).toMatch(/__pyDestr\d+\[1\]/)
  })

  it('non-simple array patterns warn by NAME and never half-bind', () => {
    for (const bad of [
      'const [a, ...r] = xs()',
      'const [, b] = xs()',
      'const [a = 1] = xs()',
      'const [[a]] = xs()',
    ]) {
      const src = FLAT.replace('const [a, b] = xs()', bad).replace(
        '{String(a + b)}',
        '{String(xs().length)}',
      )
      const { code, warnings } = transform(src, { target: 'swift' })
      expect(warnings.length, bad).toBe(1)
      expect(String(warnings[0]), bad).toContain('destructuring in this shape')
      // The whole declaration is skipped — no container, no partial aliases.
      expect(code, bad).not.toContain('__pyDestr')
    }
  })

  it('non-simple component-level OBJECT patterns get the same loud warning (were silent)', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
type Rec = { p: { q: number } }
function App() {
  const o = signal<Rec>({ p: { q: 1 } })
  const { p: { q } } = o()
  return (<Stack><Text>hello</Text></Stack>)
}`
    const { warnings } = transform(src, { target: 'swift' })
    expect(warnings.length).toBe(1)
    expect(String(warnings[0])).toContain('destructuring in this shape')
  })

  it.skipIf(!isSwiftcAvailable() || SKIP_SLOW)('parses via swiftc', () => {
    const r = validateSwift(transform(FLAT, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  // Bisect-load-bearing: pre-fix the binding silently dropped → `a`/`b`
  // unbound → a swiftc TYPE error `-parse` cannot see.
  it.skipIf(!isSwiftUIAvailable() || SKIP_SLOW)('TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(FLAT, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable() || SKIP_SLOW)('compiles via kotlinc', () => {
    const r = validateKotlin(transform(FLAT, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
