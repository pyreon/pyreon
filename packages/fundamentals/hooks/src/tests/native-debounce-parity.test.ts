/**
 * The WEB arm of `useDebouncedValue`'s native lowering — written BEFORE the
 * emit, because "leading or trailing edge?" is exactly the question two
 * native ports would answer the same wrong way and agree with each other.
 *
 * What the emit has to reproduce, measured here rather than read off the
 * implementation:
 *
 *   - the initial value is available IMMEDIATELY (no first-delay gap)
 *   - updates are TRAILING-edge: nothing lands until the source is quiet
 *   - a rapid burst collapses to the LAST value, not the first
 *
 * Native counterpart:
 *   packages/native/compiler/src/tests/native-debounced-value.test.ts
 */
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { useDebouncedValue } from '../useDebouncedValue'

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('useDebouncedValue edges', () => {
  it('seeds IMMEDIATELY — there is no first-delay gap', () => {
    const src = signal('a')
    const out = useDebouncedValue(() => src(), 30)
    // If the native emit slept before its first publish, a field would
    // render empty for the delay on every mount.
    expect(out()).toBe('a')
  })

  it('is TRAILING edge — a change does not land until the source is quiet', async () => {
    const src = signal('a')
    const out = useDebouncedValue(() => src(), 40)
    src.set('b')
    // Leading edge would already read 'b' here.
    expect(out()).toBe('a')
    await tick(70)
    expect(out()).toBe('b')
  })

  it('a burst collapses to the LAST value', async () => {
    const src = signal(0)
    const out = useDebouncedValue(() => src(), 40)
    for (const n of [1, 2, 3, 4]) src.set(n)
    await tick(70)
    // Not 1 (leading), not four separate settles — one landing, the last value.
    expect(out()).toBe(4)
  })

  it('the timer RESTARTS on each change rather than firing on a fixed cadence', async () => {
    const src = signal(0)
    const out = useDebouncedValue(() => src(), 50)
    src.set(1)
    await tick(30)
    src.set(2)
    await tick(30)
    // 60ms have passed but the source went quiet only 30ms ago, so a
    // restarting timer has not fired yet. A fixed cadence would have.
    expect(out()).toBe(0)
    await tick(40)
    expect(out()).toBe(2)
  })
})
