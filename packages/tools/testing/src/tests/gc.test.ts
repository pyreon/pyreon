/**
 * GC / leak matchers. Requires --expose-gc (wired via this package's vitest
 * config). Includes the BEFORE/AFTER rewrite of the hand-rolled WeakRef +
 * two-pass-gc ceremony to demonstrate the ergonomic collapse.
 *
 * (We prove the ergonomic win here rather than converting the two existing
 * hand-rolled GC tests in @pyreon/runtime-dom: @pyreon/testing peer-depends
 * on runtime-dom, so making runtime-dom devDepend on @pyreon/testing would be
 * a circular edge on a foundational package. The dogfood conversion target is
 * app/fundamentals tests, not core.)
 */
import { describe, expect, it } from 'vitest'
import { effect, signal, __resetReactiveDevtoolsForTesting } from '@pyreon/reactivity'
import { expectGarbageCollected, expectNoReactiveLeak } from '../index'

const hasGc = typeof (globalThis as { gc?: () => void }).gc === 'function'

describe.skipIf(!hasGc)('expectGarbageCollected', () => {
  it('BEFORE — hand-rolled WeakRef + two-pass gc (6 lines of ceremony)', async () => {
    let obj: object | null = { big: new Array(1000).fill(0) }
    const ref = new WeakRef(obj)
    obj = null
    ;(globalThis as { gc: () => void }).gc()
    await new Promise((r) => setTimeout(r, 0))
    ;(globalThis as { gc: () => void }).gc()
    expect(ref.deref()).toBeUndefined()
  })

  it('AFTER — one line', async () => {
    await expectGarbageCollected(() => ({ big: new Array(1000).fill(0) }))
  })

  it('throws when the value stays retained (a real leak)', async () => {
    const held: object[] = []
    await expect(
      expectGarbageCollected(() => {
        const o = { x: 1 }
        held.push(o) // deliberately retained
        return o
      }),
    ).rejects.toThrow(/still retained/)
  })
})

describe.skipIf(!hasGc)('expectNoReactiveLeak', () => {
  it('a disposed signal/effect leaves no net reactive-graph growth', async () => {
    __resetReactiveDevtoolsForTesting()
    await expectNoReactiveLeak(() => {
      const s = signal(0)
      const e = effect(() => {
        s()
      })
      s.set(1)
      e.dispose()
    })
  })

  it('throws when nodes accumulate without disposal (the leak class)', async () => {
    __resetReactiveDevtoolsForTesting()
    const kept: Array<() => number> = []
    await expect(
      expectNoReactiveLeak(() => {
        // Create + RETAIN signals (never disposed / never GC'd) — the graph grows.
        for (let i = 0; i < 20; i++) kept.push(signal(i))
      }),
    ).rejects.toThrow(/node count grew/)
  })
})

describe('without --expose-gc', () => {
  it.skipIf(hasGc)('throws an actionable error', async () => {
    await expect(expectGarbageCollected(() => ({}))).rejects.toThrow(/--expose-gc/)
  })
})
