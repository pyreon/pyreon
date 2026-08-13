// `useInterval` and `useTimeout` are pure timing over a callback — no
// platform capability behind them, just a clock both targets have. Neither
// lowered: they are called at STATEMENT position, and the walker's
// bare-statement arm DROPPED them with a generic warning. So a ticking clock
// or a delayed action compiled clean and did nothing on device.
//
// They lower to the idiom that already carries each target's
// auto-cancellation — SwiftUI's `.task`, Compose's `LaunchedEffect(Unit)` —
// which is what reproduces the web hooks' `onUnmount` cleanup with no runtime
// and no stored handle.
//
// The `.task` goes on the ZStack-wrapped body, NOT a transparent Group: a
// modifier on a Group is redistributed onto the conditional branches inside
// it, so it would be cancelled and restarted on every state flip. That is a
// device-found bug the fetch harness already guards against, and timers need
// the same stable host.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const APP = `import { useInterval, useTimeout } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const shown = signal(false)
  useInterval(() => { n.set(n() + 1) }, 1000)
  useTimeout(() => { shown.set(true) }, 500)
  return <Stack><Text>{n()}</Text></Stack>
}`

describe('the statement form lowers instead of being dropped', () => {
  it('Swift: an interval is a cancellation-aware loop inside .task', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('.task {')
    // `while true` would SPIN: a cancelled sleep returns immediately, so the
    // loop has to consult cancellation itself.
    expect(out).toContain('while !_Concurrency.Task.isCancelled {')
    expect(out).toContain('nanoseconds: 1000_000_000')
    expect(out).toContain('n = n + 1')
  })

  it('Swift: a timeout sleeps once and bails if cancelled meanwhile', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('nanoseconds: 500_000_000')
    expect(out).toContain('if _Concurrency.Task.isCancelled { return }')
  })

  it('Kotlin: LaunchedEffect(Unit), whose cancellation IS the cleanup', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('LaunchedEffect(Unit) {')
    expect(out).toContain('while (true) {')
    expect(out).toContain('delay(1000L)')
    expect(out).toContain('delay(500L)')
  })

  it('the verbatim call is gone and nothing warns', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(APP, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('useInterval(')
      expect(r.code).not.toContain('useTimeout(')
    }
  })

  it('the .task attaches to a STABLE host, not a transparent Group', () => {
    // Without this the modifier is redistributed onto the conditional
    // branches inside the body and restarts on every state flip.
    expect(transform(APP, { target: 'swift' }).code).toContain('ZStack {')
  })
})

describe('what cannot be baked declines BY NAME', () => {
  const decline = (call: string) =>
    transform(
      `import { useInterval, useTimeout } from '@pyreon/hooks'
import { Text } from '@pyreon/primitives'
export function App() {
  ${call}
  return <Text>x</Text>
}`,
      { target: 'swift' },
    ).warnings.join('\n')

  it('a null (paused) delay — treating it as running would be worse', () => {
    const w = decline('useInterval(() => { tick() }, null)')
    expect(w).toContain('literal millisecond delay')
    expect(w).toContain('will not run on device')
  })

  it('a reactive getter delay', () => {
    expect(decline('useInterval(() => { tick() }, () => 1000)')).toContain(
      'reactive getter',
    )
  })

  it('a non-inline callback', () => {
    expect(decline('useTimeout(handler, 500)')).toContain('inline callback')
  })

  it('a declined timer emits no schedule at all', () => {
    const out = transform(
      `import { useInterval } from '@pyreon/hooks'
import { Text } from '@pyreon/primitives'
export function App() { useInterval(() => { tick() }, null); return <Text>x</Text> }`,
      { target: 'swift' },
    ).code
    expect(out).not.toContain('.task {')
  })
})

describe('the emitted timers survive the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin compiles on kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
