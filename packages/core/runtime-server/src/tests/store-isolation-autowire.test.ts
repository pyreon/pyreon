import { h } from '@pyreon/core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { renderToString, runWithRequestContext } from '../index'

/**
 * `configureStoreIsolation` has always existed and works, but it is opt-in —
 * and the two layers that own the server (`@pyreon/server`, `@pyreon/zero`)
 * cannot call it, because neither depends on `@pyreon/store`. That is the whole
 * reason the API takes a setter as an argument. So the only party who could opt
 * in was the application author, via a paragraph in a package they never
 * import, and the default was a process-global registry shared by every
 * concurrent request.
 *
 * `@pyreon/store` now publishes its setter on a `globalThis` seam when it loads
 * on a server, and this module picks it up at its own choke point — the
 * `__PYREON_STYLER_COLLECT__` shape, for the same reason.
 *
 * These specs drive the seam directly rather than importing `@pyreon/store`,
 * which this package does not depend on. The publishing half is locked in the
 * store package.
 */
type Seam = { __PYREON_STORE_SET_REGISTRY_PROVIDER__?: (fn: () => Map<string, unknown>) => void }

/**
 * Activation is one-way and module-scoped — it is startup wiring, not per-call
 * state — so the seam is registered ONCE here and every spec reads the provider
 * it produced. Re-registering per test would silently no-op after the first.
 */
let provider: (() => Map<string, unknown>) | null = null

beforeAll(async () => {
  // Registered AFTER this module loaded, which models the real import order:
  // the renderer may well evaluate before the app first imports `@pyreon/store`.
  ;(globalThis as Seam).__PYREON_STORE_SET_REGISTRY_PROVIDER__ = (fn) => {
    provider = fn
  }
  await renderToString(h('div', null, 'x'))
})

afterAll(() => {
  delete (globalThis as Seam).__PYREON_STORE_SET_REGISTRY_PROVIDER__
})

describe('store-isolation auto-wiring', () => {
  test('a seam published after load is consulted at the render choke point', () => {
    expect(provider, 'the seam was never consulted').not.toBeNull()
  })

  test('each request gets a DIFFERENT registry', async () => {
    const read = provider as unknown as () => Map<string, unknown>
    const a = await runWithRequestContext(async () => read())
    const b = await runWithRequestContext(async () => read())
    expect(a).not.toBe(b)
  })

  test('a value written in one request is invisible to the next', async () => {
    // The actual defect: a store populated during request A was readable by B.
    const read = provider as unknown as () => Map<string, unknown>
    await runWithRequestContext(async () => {
      read().set('user', 'alice')
    })
    expect(await runWithRequestContext(async () => read().get('user'))).toBeUndefined()
  })

  test('rendering still works when no seam is present', async () => {
    // `@pyreon/store` is an optional peer of the server stack — a renderer with
    // no store in the graph must be unaffected.
    delete (globalThis as Seam).__PYREON_STORE_SET_REGISTRY_PROVIDER__
    await expect(renderToString(h('div', null, 'no-store'))).resolves.toBe('<div>no-store</div>')
  })
})
