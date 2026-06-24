// Phase 5b — component-body plain-const capture (subset widening).
//
// Before this, a component-body `const` whose initializer was NOT a known
// hook/store/signal CALL was silently DROPPED by parse.ts (`if (init.type !==
// 'CallExpression') return null`). So ubiquitous local bindings vanished:
//
//   const label = 'Total: '        → gone
//   const doubled = base() * 2      → gone
//   const sum = 5 + 3               → gone
//
// Now they are captured as a `value` DeclIR and emitted as a body-local
// binding on BOTH native targets — captures-once, exactly like a JS `const`:
//
//   Swift  → `let <name> = <expr>` injected at the top of `var body: some View`
//            (Swift infers the type; the binding can read @State signals bare)
//   Kotlin → `val <name> = <expr>` in the composable body
//
// Web is unaffected (the real DOM runtime already runs the const). This widens
// the supported-TS subset so more real apps compile from one source.

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

const wrap = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'\nfunction App() {\n${body}\n}`

describe('Phase 5b — component-body plain-const capture', () => {
  it('Swift: string + arithmetic consts emit as body-local lets', () => {
    const out = transform(
      wrap(`  const base = signal(10)
  const label = 'Total: '
  const doubled = base() * 2
  return (<Stack><Text>{label}</Text><Text>{doubled}</Text></Stack>)`),
      { target: 'swift' },
    ).code
    expect(out).toContain('let label = "Total: "')
    // reads @State `base` bare (no `.value` on Swift @Observable)
    expect(out).toContain('let doubled = base * 2')
  })

  it('Swift: numeric const that used to be dropped now emits', () => {
    const out = transform(
      wrap(`  const sum = 5 + 3
  return (<Stack><Text>{sum}</Text></Stack>)`),
      { target: 'swift' },
    ).code
    expect(out).toContain('let sum = 5 + 3')
  })

  it('Kotlin: string + arithmetic consts emit as composable-body vals', () => {
    const out = transform(
      wrap(`  const base = signal(10)
  const label = 'Total: '
  const doubled = base() * 2
  return (<Stack><Text>{label}</Text><Text>{doubled}</Text></Stack>)`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('val label = "Total: "')
    // signal-backed state uses the `by remember` delegate → reads are bare
    expect(out).toContain('val doubled = base * 2')
  })

  it('Kotlin: numeric const that used to be dropped now emits', () => {
    const out = transform(
      wrap(`  const sum = 5 + 3
  return (<Stack><Text>{sum}</Text></Stack>)`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('val sum = 5 + 3')
  })

  it.skipIf(!isSwiftcAvailable())(
    'Swift: a component using plain consts typechecks via swiftc',
    () => {
      const out = transform(
        wrap(`  const base = signal(10)
  const label = 'Total: '
  const doubled = base() * 2
  return (<Stack><Text>{label}</Text><Text>{doubled}</Text></Stack>)`),
        { target: 'swift' },
      ).code
      const res = validateSwift(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )

  it.skipIf(!isKotlincAvailable())(
    'Kotlin: a component using plain consts typechecks via kotlinc',
    () => {
      const out = transform(
        wrap(`  const base = signal(10)
  const label = 'Total: '
  const doubled = base() * 2
  return (<Stack><Text>{label}</Text><Text>{doubled}</Text></Stack>)`),
        { target: 'kotlin' },
      ).code
      const res = validateKotlin(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )
})

// A struct-level Swift computed can't see the body-local `let`s that
// value-consts emit as — so `const base=10; computed(()=>base+5)` emitted
// `private var n: Int { base+5 }` referencing an out-of-scope `base`
// (`swiftc -typecheck`: "cannot find 'base' in scope"). The `-parse` gate
// + emit-shape tests MISSED it (syntactically valid); only the
// `swiftc -typecheck` gate caught it. Fix: INLINE referenced value-consts
// into the computed's emitted getter (Swift only — Kotlin's const `val`
// and `derivedStateOf` share the Composable body, so it's already in scope).
describe('value-const referenced by a computed — Swift inline', () => {
  it('Swift: inlines the value-const into the computed getter (not a bare ref)', () => {
    const out = transform(
      wrap(`  const base = 10
  const n = computed(() => base + 5)
  return (<Stack><Text>{String(n())}</Text></Stack>)`),
      { target: 'swift' },
    ).code
    expect(out).toContain('private var n: Int { (10) + 5 }')
    expect(out).not.toMatch(/private var n: Int \{ base \+ 5 \}/)
  })

  it('Swift: preserves precedence when inlining a compound const', () => {
    // `b = a + 1`, computed `b * 10` MUST inline to `((2) + 1) * 10`
    // (= 30), NOT `2 + 1 * 10` (= 12) — the inlined expr is parenthesized.
    const out = transform(
      wrap(`  const a = 2
  const b = a + 1
  const n = computed(() => b * 10)
  return (<Stack><Text>{String(n())}</Text></Stack>)`),
      { target: 'swift' },
    ).code
    expect(out).toContain('private var n: Int { ((2) + 1) * 10 }')
  })

  it('Swift: a value-const NOT referenced by a computed is unaffected', () => {
    // Regression guard: pure body-only consts still emit as body-local lets.
    const out = transform(
      wrap(`  const label = 'Hi'
  return (<Stack><Text>{label}</Text></Stack>)`),
      { target: 'swift' },
    ).code
    expect(out).toContain('let label = "Hi"')
  })

  it.skipIf(!isSwiftUIAvailable())(
    'Swift: value-const-in-computed typechecks against real SwiftUI (single + multi-statement)',
    () => {
      for (const body of [
        `  const base = 10
  const n = computed(() => base + 5)
  return (<Stack><Text>{String(n())}</Text></Stack>)`,
        `  const base = 10
  const n = computed(() => { const x = base * 2; return x + 1 })
  return (<Stack><Text>{String(n())}</Text></Stack>)`,
      ]) {
        const out = transform(wrap(body), { target: 'swift' }).code
        const res = validateSwiftTypecheck(out)
        expect(res.ok, res.error ?? '').toBe(true)
      }
    },
  )

  it.skipIf(!isKotlincAvailable())(
    'Kotlin: value-const-in-computed still typechecks (no inline needed — same scope)',
    () => {
      const out = transform(
        wrap(`  const base = 10
  const n = computed(() => base + 5)
  return (<Stack><Text>{String(n())}</Text></Stack>)`),
        { target: 'kotlin' },
      ).code
      const res = validateKotlin(out)
      expect(res.ok, res.error ?? '').toBe(true)
    },
  )
})
