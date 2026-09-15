/**
 * The store bridge against a `@pyreon/store` that is not the one it expects.
 *
 * `store-bridge.test.ts` drives the REAL package, which is the load-bearing
 * test — it proves the plugin/subscribe mechanism works end to end. These two
 * cases cover what the real package cannot produce on demand: a store module
 * that does not carry `addStorePlugin` (an older major, or a stub), and a
 * plugin api with no `subscribe` (nothing to observe). Both are the reason the
 * dependency is treated as OPTIONAL at all, and the reason the panel renders a
 * state instead of throwing.
 *
 * The substitute is the store PACKAGE, never the code under test, and the arms
 * exist precisely to tolerate a package that does not match — there is no real
 * input that reaches them. Each case resets the module registry so the
 * module-level `installed` flag (deliberately one-shot; see `_resetStoreBridge`)
 * starts fresh and does not leak into its neighbour.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.doUnmock('@pyreon/store')
})

const settle = () => new Promise((r) => setTimeout(r, 50))

describe('a store package with no addStorePlugin', () => {
  it('reports the package as unavailable instead of throwing', async () => {
    // `addStorePlugin: undefined` EXPLICITLY, not merely omitted: vitest's
    // mocked namespace throws on reading an export the factory did not
    // declare, so an omission would land in the catch below instead of in the
    // shape check — the test would pass by the wrong path (verified: it did,
    // until the export was declared).
    vi.doMock('@pyreon/store', () => ({ addStorePlugin: undefined }))
    const bridge = await import('../store-bridge')

    // Before anything is attempted the panel offers Record: "nothing tried
    // yet" must not read as "not available".
    expect(bridge.isStoreAvailable()).toBe(true)

    bridge.installStoreRecorder(() => {})
    await settle()

    expect(bridge.isStoreAvailable()).toBe(false)
  })

  it('a package that FAILS to load reports the same way, not as a crash', async () => {
    // A distinct path to the same verdict — the module never resolved at all.
    vi.doMock('@pyreon/store', () => {
      throw new Error('Cannot find module')
    })
    const bridge = await import('../store-bridge')
    bridge.installStoreRecorder(() => {})
    await settle()
    expect(bridge.isStoreAvailable()).toBe(false)
  })
})

describe('a plugin api with no subscribe', () => {
  it('records nothing from it, and does NOT mark the package unavailable', async () => {
    // The distinction the two arms draw: a module without `addStorePlugin` is
    // the wrong package; a single api without `subscribe` is one store with
    // nothing to observe, and the panel must stay usable for the others.
    const written: unknown[] = []
    let registered: ((api: Record<string, unknown>) => unknown) | undefined
    vi.doMock('@pyreon/store', () => ({
      addStorePlugin: (plugin: (api: Record<string, unknown>) => unknown) => {
        registered = plugin
      },
    }))

    const bridge = await import('../store-bridge')
    bridge.installStoreRecorder((m) => written.push(m))
    await settle()

    expect(bridge.isStoreAvailable()).toBe(true)
    expect(registered).toBeTypeOf('function')
    expect(registered!({ id: 'no-subscribe', store: {} })).toBeUndefined()
    expect(written).toEqual([])
  })

  it('an api WITH subscribe is wired, and the recorder sees its writes', async () => {
    const written: string[] = []
    let registered: ((api: Record<string, unknown>) => unknown) | undefined
    vi.doMock('@pyreon/store', () => ({
      addStorePlugin: (plugin: (api: Record<string, unknown>) => unknown) => {
        registered = plugin
      },
    }))

    const bridge = await import('../store-bridge')
    bridge.installStoreRecorder((m) => written.push(m.storeId))
    await settle()

    let publish: ((m: unknown, s: unknown) => void) | undefined
    const dispose = registered!({
      id: 's',
      store: {},
      subscribe: (cb: (m: unknown, s: unknown) => void) => {
        publish = cb
        return () => {}
      },
    })
    expect(dispose).toBeTypeOf('function')

    publish!({ storeId: 's', type: 'direct', events: [] }, {})
    expect(written).toEqual(['s'])

    // Stop takes effect immediately for stores that were ALREADY created —
    // the plugin reads through the active recorder on every write.
    bridge.uninstallStoreRecorder()
    publish!({ storeId: 's', type: 'direct', events: [] }, {})
    expect(written).toEqual(['s'])
  })
})
