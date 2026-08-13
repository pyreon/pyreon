// `useDebouncedValue` did not lower — the call emitted verbatim, so a
// debounced search field compiled clean and never updated on device.
//
// The web contract was MEASURED before this emit was written (see
// @pyreon/hooks' native-debounce-parity.test.ts), because "leading or
// trailing edge?" is exactly the question two native ports would answer the
// same wrong way and agree with each other. What the emit reproduces:
//
//   - the value is available IMMEDIATELY (no first-delay gap)
//   - updates are TRAILING-edge
//   - a burst collapses to the LAST value
//   - the timer RESTARTS on each change rather than firing on a cadence
//
// That last property is what makes the lowering exact rather than
// approximate: `.task(id:)` and `LaunchedEffect(key)` both cancel and restart
// when their key changes, which IS a restarting trailing-edge debounce. No
// runtime, no stored timer handle.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const APP = `import { useDebouncedValue } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const query = signal('')
  const debounced = useDebouncedValue(() => query(), 300)
  return <Stack><Text>{debounced()}</Text></Stack>
}`

describe('the debounce rides the key-restart idiom', () => {
  it('Swift: .task(id:) on the source, guarded against a cancelled sleep', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('.task(id: query) {')
    expect(out).toContain('nanoseconds: 300_000_000')
    // A cancelled sleep returns immediately, so an unguarded write would
    // publish an intermediate value from a superseded burst.
    expect(out).toContain('if _Concurrency.Task.isCancelled { return }')
    expect(out).toContain('debounced = query')
  })

  it('Kotlin: LaunchedEffect keyed on the source', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('LaunchedEffect(query) {')
    expect(out).toContain('delay(300L)')
    expect(out).toContain('debounced = query')
  })

  it('seeds IMMEDIATELY, from the source signal own initial', () => {
    // Not from the source property: a @State initializer runs before `self`
    // exists, so `@State var d = query` is "cannot use instance member
    // within property initializer". And a type-default seed would leave the
    // field empty for the whole delay on every mount — a visible divergence
    // from the measured web contract.
    expect(transform(APP, { target: 'swift' }).code).toContain(
      '@State private var debounced: String = ""',
    )
    expect(transform(APP, { target: 'kotlin' }).code).toContain(
      'var debounced by remember { mutableStateOf(query) }',
    )
  })

  it('the verbatim call is gone and nothing warns', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(APP, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('useDebouncedValue(')
    }
  })

  it('the .task attaches to a STABLE host, not a transparent Group', () => {
    expect(transform(APP, { target: 'swift' }).code).toContain('ZStack {')
  })
})

describe('what cannot be baked declines BY NAME', () => {
  const decline = (call: string) =>
    transform(
      `import { useDebouncedValue } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function App() {
  const query = signal('')
  ${call}
  return <Text>x</Text>
}`,
      { target: 'swift' },
    ).warnings.join('\n')

  it('a non-literal delay', () => {
    expect(decline('const d = useDebouncedValue(() => query(), ms)')).toContain(
      'numeric literal',
    )
  })

  it('a block-body getter', () => {
    expect(
      decline('const d = useDebouncedValue(() => { return query() }, 300)'),
    ).toContain('expression-body getter')
  })
})

describe('the emitted debounce survives the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin compiles on kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
