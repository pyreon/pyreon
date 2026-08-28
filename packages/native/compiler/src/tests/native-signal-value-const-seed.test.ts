// ─── Signal seeded from a component value-const (Swift) ─────────────────────
//
// THE BUG: `const start = 10; const count = signal(start)` emitted
//
//   @State private var count: Any = start   // + `let start = 10` inside body
//
// Two stacked defects, both warning-free and invisible to the parse-only
// gate: (1) a STORED-PROPERTY initializer cannot reference the body-local
// `let` a value-const emits as — `cannot find 'start' in scope` under the
// real-SDK typecheck; (2) the annotation stayed `Any` because parse-time
// inference is ctx-less. Kotlin was never broken (its `val` and
// `mutableStateOf` share one function scope).
//
// THE FIX: the initializer runs through `inlineValueConsts` (the SAME
// machinery struct-level computeds and handler bodies already use for the
// SAME constraint), and the `Any` annotation refines through
// `inferType(d.initial, _exprInferCtx)` first (the debounced-value
// precedent) before falling back to object-literal struct resolution.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('signal seeded from a value-const', () => {
  it('Swift: inlines the const and infers the annotation', () => {
    const out = transform(
      app(`  const start = 10\n  const count = signal(start)`),
      { target: 'swift' },
    ).code
    expect(out).toContain('@State private var count: Int = (10)')
    expect(out).not.toContain(': Any')
  })

  it('Swift: a DERIVED const chain inlines transitively and types', () => {
    const out = transform(
      app(
        `  const start = 10\n  const factor = 2\n  const scaled = start * factor\n  const big = signal(scaled)`,
      ),
      { target: 'swift' },
    ).code
    expect(out).toContain('@State private var big: Int = ((10) * (2))')
    expect(out).not.toContain(': Any')
  })

  it('Swift: a string const seed types String', () => {
    const out = transform(
      app(`  const greeting = "hi"\n  const label = signal(greeting)`),
      { target: 'swift' },
    ).code
    expect(out).toContain('@State private var label: String = ("hi")')
  })

  it('Swift: a literal seed is byte-unchanged (no inlining applies)', () => {
    const out = transform(app(`  const count = signal(5)`), { target: 'swift' }).code
    expect(out).toContain('@State private var count: Int = 5')
  })

  it('Kotlin: emit is unchanged — val and mutableStateOf share one scope', () => {
    const out = transform(
      app(`  const start = 10\n  const count = signal(start)`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('val start = 10')
    expect(out).toContain('var count by remember { mutableStateOf(start) }')
  })

  it.runIf(isSwiftUIAvailable())('REAL-SDK typecheck: the const-seeded signal compiles', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const start = 10
  const factor = 2
  const scaled = start * factor
  const count = signal(start)
  const big = signal(scaled)
  return (<Stack><Text>{count()}</Text><Text>{big()}</Text></Stack>)
}`
    const r = validateSwiftTypecheck(transform(src, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error).slice(0, 400)).toBe(true)
  })

  it.runIf(isKotlincAvailable())('kotlinc: the Kotlin twin still compiles', async () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const start = 10
  const count = signal(start)
  return (<Stack><Text>{count()}</Text></Stack>)
}`
    const r = await validateKotlin(transform(src, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String((r as { error?: string }).error).slice(0, 400)).toBe(true)
  })
})
