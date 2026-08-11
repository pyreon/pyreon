import { signal } from '@pyreon/reactivity'
import { defineStore } from '@pyreon/store'
import { _resetStoreBridge, installStoreRecorder, uninstallStoreRecorder } from '../store-bridge'
import {
  describeStep,
  emptyTimeline,
  hotKeys,
  record,
  stateAt,
  stepBack,
  type StoreTimeline,
} from '../store-timeline'

/** Wire the bridge to a timeline, exactly as the panel does. */
async function recording(): Promise<{ read: () => StoreTimeline }> {
  let timeline = emptyTimeline()
  _resetStoreBridge()
  installStoreRecorder((m, state) => {
    timeline = record(timeline, {
      storeId: m.storeId,
      type: m.type,
      changes: m.events.map((e) => ({ key: e.key, oldValue: e.oldValue, newValue: e.newValue })),
      state: { ...state },
    })
  })
  // The plugin registers through a dynamic import — a store created before it
  // lands is not observed, which is a real ordering property of the seam.
  await new Promise((r) => setTimeout(r, 300))
  return { read: () => timeline }
}

describe('store bridge → timeline (against a REAL @pyreon/store)', () => {
  afterEach(() => {
    uninstallStoreRecorder()
    _resetStoreBridge()
  })

  it('records every write, and time-travel shows the state AS IT WAS', async () => {
    // The §9 claim in one test: the mutation stream is real, and stepping back
    // reproduces an earlier state rather than re-deriving it.
    const { read } = await recording()
    const useCart = defineStore('cart-timetravel', () => ({ count: signal(0), name: signal('x') }))
    const api = useCart()
    api.store.count.set(1)
    api.store.count.set(2)
    api.store.name.set('y')
    await new Promise((r) => setTimeout(r, 100))

    const t = read()
    expect(t.steps).toHaveLength(3)
    expect(stateAt(t)).toEqual({ count: 2, name: 'y' })
    // Two steps back is the state after the FIRST write — not a recomputation.
    expect(stateAt(stepBack(stepBack(t)))).toEqual({ count: 1, name: 'x' })
  }, 30_000)

  it('names the store and the key that changed', async () => {
    const { read } = await recording()
    const useUser = defineStore('user-desc', () => ({ email: signal('') }))
    useUser().store.email.set('a@b.c')
    await new Promise((r) => setTimeout(r, 100))
    expect(read().steps.map(describeStep)).toContain('user-desc · set email')
  }, 30_000)

  it('surfaces a key written more than once in one interaction', async () => {
    const { read } = await recording()
    const useHot = defineStore('hot-keys', () => ({ n: signal(0), other: signal(0) }))
    const api = useHot()
    api.store.n.set(1)
    api.store.n.set(2)
    api.store.other.set(9)
    await new Promise((r) => setTimeout(r, 100))
    expect(hotKeys(read())).toEqual([{ key: 'n', writes: 2 }])
  }, 30_000)

  it('stops recording when uninstalled, without detaching the plugin', async () => {
    // `addStorePlugin` has no counterpart to remove it, so Stop must be a flag
    // the plugin reads. If it were an unregistration, a second Record press
    // would leak a subscription per press.
    const { read } = await recording()
    const useStop = defineStore('stop-recording', () => ({ v: signal(0) }))
    const api = useStop()
    api.store.v.set(1)
    await new Promise((r) => setTimeout(r, 100))
    const before = read().steps.length
    uninstallStoreRecorder()
    api.store.v.set(2)
    await new Promise((r) => setTimeout(r, 100))
    expect(read().steps).toHaveLength(before)
  }, 30_000)
})
