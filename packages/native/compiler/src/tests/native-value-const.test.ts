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
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

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
