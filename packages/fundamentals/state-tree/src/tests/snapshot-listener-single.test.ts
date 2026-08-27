import { describe, expect, it } from 'vitest'
import { model, onSnapshot } from '../index'

const tick = () => new Promise<void>((r) => queueMicrotask(r))

/**
 * Locks the single-listener fast path in the snapshot-notify microtask. The
 * common shape is one `onSnapshot(model, fn)`, where the `[...snapshotListeners]`
 * snapshot is a throwaway array. The fast path captures the sole listener and
 * fires it; these specs pin it fires once with the snapshot, and that the
 * multi-listener path still fires everyone.
 */
describe('state-tree — single snapshot-listener fast path', () => {
  it('fires the sole listener once with the snapshot', async () => {
    const M = model({ state: { count: 0 } })
    const m = M.create()
    const snaps: { count: number }[] = []
    onSnapshot(m, (s) => snaps.push(s as { count: number }))
    m.count.set(5)
    await tick()
    expect(snaps.length).toBe(1)
    expect(snaps[0]!.count).toBe(5)
  })

  it('multiple listeners all fire (snapshot path)', async () => {
    const M = model({ state: { count: 0 } })
    const m = M.create()
    let a = 0
    let b = 0
    onSnapshot(m, () => a++)
    onSnapshot(m, () => b++)
    m.count.set(3)
    await tick()
    expect(a).toBe(1)
    expect(b).toBe(1)
  })
})
