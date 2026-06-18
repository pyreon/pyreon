// @vitest-environment node
// `persistViaIndexedDB` is a thin wrapper over y-indexeddb's `IndexeddbPersistence`.
// IndexedDB is unavailable in happy-dom / Node, and the actual IndexedDB I/O is
// owned by y-indexeddb (third-party — not our coverage target). So we mock the
// `IndexeddbPersistence` class to a minimal stub and assert the WRAPPER's own
// logic: it constructs the provider with (dbName, yDoc), exposes a `whenSynced`
// that resolves to `undefined` (mapped off the provider's), and forwards
// `destroy()`. This exercises the real `persistViaIndexedDB` + both inline
// closures — the only Pyreon code in the module.
import { describe, expect, it, vi } from 'vitest'

const ctorCalls: Array<{ dbName: string; doc: unknown }> = []
let destroyCalls = 0

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    whenSynced: Promise<unknown>
    constructor(dbName: string, doc: unknown) {
      ctorCalls.push({ dbName, doc })
      // Resolve to a non-undefined value so the wrapper's `.then(() => undefined)`
      // mapping is observably exercised (it must NORMALIZE to undefined).
      this.whenSynced = Promise.resolve(this)
    }
    destroy(): Promise<void> {
      destroyCalls++
      return Promise.resolve()
    }
  },
}))

const { createYjsDoc } = await import('../crdt/yjs-adapter')
const { persistViaIndexedDB } = await import('../crdt/yjs-persistence')

describe('persistViaIndexedDB', () => {
  it('constructs the provider with (dbName, yDoc) and maps whenSynced → undefined', async () => {
    const doc = createYjsDoc()
    const persist = persistViaIndexedDB(doc, 'my-app-doc')

    expect(ctorCalls.at(-1)).toEqual({ dbName: 'my-app-doc', doc: doc.yDoc })

    // whenSynced normalizes the provider's resolution (the class above resolves
    // to `this`) to `undefined`.
    const synced = await persist.whenSynced
    expect(synced).toBeUndefined()

    doc.destroy()
  })

  it('forwards destroy() to the provider', async () => {
    const doc = createYjsDoc()
    const before = destroyCalls
    const persist = persistViaIndexedDB(doc, 'doc-2')
    await persist.destroy()
    expect(destroyCalls).toBe(before + 1)
    doc.destroy()
  })
})
