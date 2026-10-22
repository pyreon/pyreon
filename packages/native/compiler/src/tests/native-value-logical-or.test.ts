// JS `a || b` over a number or string produces a VALUE from truthiness, and now lowers to it on both targets.
//
// BEFORE: Swift and Kotlin `||` are Bool-only, so `name() || 'anon'` and the parsed-field guard
// `Number(v) || 0` were passed through verbatim with a named warning and did not compile. Both are among the most
// common defaulting idioms in TypeScript.
//
// The lowering binds the left operand ONCE (it is often a call) and evaluates the right only when the left is falsy,
// exactly as JS does. Falsy is `""` for a string, `0` for an int, `0` or NaN for a double. Shapes whose falsiness has
// no single native test (an optional, mismatched kinds) and `&&` keep the named warning.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const APP = [
  "import { Text, Stack, Field } from '@pyreon/primitives'",
  "import { signal, computed } from '@pyreon/reactivity'",
  'export function App() {',
  "  const name = signal('')",
  '  const count = signal(0)',
  '  const qty = signal(1)',
  "  const shown = computed(() => name() || 'anon')",
  '  const per = computed(() => count() || 1)',
  '  return (',
  '    <Stack>',
  '      <Field value={String(qty())} onChangeText={(v: string) => qty.set(Number(v) || 0)} />',
  '      <Text>{shown()} {String(per() * 2)} {String(qty() * 2)}</Text>',
  '    </Stack>',
  '  )',
  '}',
].join('\n')

const STILL_WARNS = [
  "import { Text } from '@pyreon/primitives'",
  "import { signal } from '@pyreon/reactivity'",
  'export function App() {',
  "  const name = signal('')",
  '  const count = signal(0)',
  "  return <Text>{String(count() && 'x')}</Text>",
  '}',
].join('\n')

describe('Swift', () => {
  const out = transform(APP, { target: 'swift' })

  it('lowers each value-producing || with the left bound once', () => {
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('{ () -> String in let __or = name; return __or.isEmpty ? "anon" : __or }()')
    expect(out.code).toContain('{ () -> Int in let __or = count; return __or == 0 ? 1 : __or }()')
    expect(out.code).toContain('return __or == 0 || __or.isNaN ? Double(0) : __or }()')
    // The parsed value widens the signal to Double, as a bare `qty.set(Number(v))` does.
    expect(out.code).toContain('@State private var qty: Double = 1.0')
  })

  it.skipIf(!isSwiftcAvailable())('typechecks', () => {
    const r = validateSwiftWithStubs(out.code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it('&& over a non-boolean still warns by name', () => {
    expect(transform(STILL_WARNS, { target: 'swift' }).warnings.join('\n')).toContain('`&&` with a non-boolean')
  })
})

describe('Kotlin', () => {
  const out = transform(APP, { target: 'kotlin' })

  it('lowers each value-producing || with the left bound once', () => {
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('(name).let { __or -> if (__or.isEmpty()) "anon" else __or }')
    expect(out.code).toContain('(count).let { __or -> if (__or == 0L) 1L else __or }')
    expect(out.code).toContain('if (__or == 0.0 || __or.isNaN())')
  })

  it.skipIf(!isKotlincAvailable())('compiles', () => {
    const r = validateKotlin(out.code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)

  it('&& over a non-boolean still warns by name', () => {
    expect(transform(STILL_WARNS, { target: 'kotlin' }).warnings.join('\n')).toContain('`&&` with a non-boolean')
  })
})
