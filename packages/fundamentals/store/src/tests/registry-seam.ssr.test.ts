// @vitest-environment node
//
// The seam publishes only when `document` is undefined, so this file must run
// in a real node environment — the package's default is happy-dom, where the
// browser arm is correct and the seam is deliberately absent.
import { describe, expect, it } from 'vitest'

type Seam = { __PYREON_STORE_SET_REGISTRY_PROVIDER__?: (fn: () => Map<string, unknown>) => void }

/**
 * `@pyreon/store` publishes its registry setter on `globalThis` when it loads
 * on a server, so `@pyreon/runtime-server` can wire per-request isolation
 * without anyone remembering to.
 *
 * The explicit `configureStoreIsolation` path always existed and works, but it
 * is opt-in — and the layers that own the server (`@pyreon/server`,
 * `@pyreon/zero`) cannot call it, because neither depends on this package.
 * That is why the API takes a setter as an argument, and it is also why nobody
 * was on it: the default was a process-global registry shared by every
 * concurrent request.
 *
 * This file locks the PUBLISHING half. The consuming half is locked in
 * `runtime-server`'s `store-isolation-autowire.test.ts` — neither package
 * depends on the other, so neither can test the pair end-to-end.
 */
describe('the server registry seam', () => {
  it('is published on a server', async () => {
    await import('../registry')
    expect(typeof (globalThis as Seam).__PYREON_STORE_SET_REGISTRY_PROVIDER__).toBe('function')
  })

  it('actually swaps the provider — it is the real setter, not a stub', async () => {
    const { getRegistry } = await import('../registry')
    const before = getRegistry()

    const mine = new Map<string, unknown>()
    ;(globalThis as Seam).__PYREON_STORE_SET_REGISTRY_PROVIDER__?.(() => mine)

    expect(getRegistry()).toBe(mine)
    expect(getRegistry()).not.toBe(before)

    // Restore the default so the rest of the suite is unaffected.
    const { setRegistryProvider } = await import('../registry')
    setRegistryProvider(() => before)
    expect(getRegistry()).toBe(before)
  })
})
