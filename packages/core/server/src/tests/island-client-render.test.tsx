// @vitest-environment happy-dom
/**
 * Coverage for the CLIENT-side invocation path of `island()` — exercises
 * the wrapper's async return AND the prefetch-attr branch under happy-dom.
 *
 * The wrapper is an async function (`async IslandWrapper(props)`); each
 * test awaits and asserts the resolved VNode shape. The `data-prefetch`
 * attr is the principal client-visible signal — emitted only when
 * `prefetch !== 'none'` AND `hydrate` is a deferred strategy (not `load`
 * / `never`). The rest of the client-side scheduling (onMount → dynamic
 * `./client` import → schedulePrefetch / scheduleHydration) is covered
 * by the sibling `island-client.test.tsx` which mounts via `mount()` to
 * exercise the full DOM lifecycle, and by `islands.browser.test.tsx`
 * under real Chromium.
 *
 * Pre-rewrite (the broken state this fixes): the file invoked the
 * IslandWrapper synchronously and asserted `vnode.type` — but the
 * wrapper is async, so `vnode` was a Promise and every test failed with
 * `expected undefined to be 'pyreon-island'`. The assertions also
 * referenced a `props.ref` that the current `island()` doesn't emit
 * (the client-side scheduling lives in the wrapper that `mount()`
 * drives, not on a ref prop). Both bugs fixed: tests now await + assert
 * on the actually-emitted VNode shape (data-* attrs).
 */
import { describe, expect, it } from 'vitest'
import { island } from '../island'
import type { ComponentFn } from '@pyreon/core'

const dummyLoader = () =>
  Promise.resolve({ default: (() => null) as unknown as ComponentFn<Record<string, unknown>> })

interface IslandVNode {
  type?: unknown
  props?: Record<string, unknown>
}

describe('island() — client-side invocation path under happy-dom', () => {
  it("hydrate='never' returns a <pyreon-island> with data-hydrate='never' + no data-prefetch", async () => {
    const Island = island(dummyLoader, { name: 'NeverIsland', hydrate: 'never' })
    const vnode = (await Island({})) as IslandVNode
    expect(vnode.type).toBe('pyreon-island')
    expect(vnode.props?.['data-component']).toBe('NeverIsland')
    expect(vnode.props?.['data-hydrate']).toBe('never')
    // `never` is one of the strategies that suppresses the prefetch hint
    // even when set — the wrapper's attrs-build branch checks this.
    expect(vnode.props?.['data-prefetch']).toBeUndefined()
  })

  it("hydrate='visible' emits the marker with data-hydrate='visible'", async () => {
    const Island = island(dummyLoader, { name: 'VisibleIsland', hydrate: 'visible' })
    const vnode = (await Island({ message: 'hello' })) as IslandVNode
    expect(vnode.type).toBe('pyreon-island')
    expect(vnode.props?.['data-component']).toBe('VisibleIsland')
    expect(vnode.props?.['data-hydrate']).toBe('visible')
    // Props are serialized into data-props as JSON — the wrapper's
    // serialization path runs.
    expect(typeof vnode.props?.['data-props']).toBe('string')
  })

  it("hydrate='interaction' emits the marker with data-hydrate='interaction'", async () => {
    const Island = island(dummyLoader, { name: 'IntIsland', hydrate: 'interaction' })
    const vnode = (await Island({})) as IslandVNode
    expect(vnode.type).toBe('pyreon-island')
    expect(vnode.props?.['data-hydrate']).toBe('interaction')
  })

  it("prefetch='idle' + hydrate='visible' emits data-prefetch='idle'", async () => {
    const Island = island(dummyLoader, {
      name: 'PrefetchIsland',
      hydrate: 'visible',
      prefetch: 'idle',
    })
    const vnode = (await Island({})) as IslandVNode
    expect(vnode.type).toBe('pyreon-island')
    // The wrapper's branch `prefetch !== 'none' && hydrate !== 'load' &&
    // hydrate !== 'never'` evaluates true — `data-prefetch` is emitted.
    expect(vnode.props?.['data-prefetch']).toBe('idle')
  })

  it("default prefetch='none' suppresses the data-prefetch attr", async () => {
    const Island = island(dummyLoader, { name: 'NoPrefetchIsland', hydrate: 'idle' })
    const vnode = (await Island({})) as IslandVNode
    expect(vnode.type).toBe('pyreon-island')
    // Default prefetch is 'none' — the branch short-circuits and no
    // data-prefetch attr is emitted (keeps SSR HTML clean).
    expect(vnode.props?.['data-prefetch']).toBeUndefined()
  })

  it("prefetch='visible' is suppressed when hydrate='load' (no-op pairing)", async () => {
    const Island = island(dummyLoader, {
      name: 'LoadPrefetch',
      hydrate: 'load',
      prefetch: 'visible',
    })
    const vnode = (await Island({})) as IslandVNode
    expect(vnode.type).toBe('pyreon-island')
    // `hydrate: 'load'` runs the loader synchronously — prefetch is a no-op.
    // The wrapper's branch correctly suppresses the data-prefetch hint.
    expect(vnode.props?.['data-prefetch']).toBeUndefined()
  })

  it("prefetch='idle' is suppressed when hydrate='never' (zero-JS strategy)", async () => {
    const Island = island(dummyLoader, {
      name: 'NeverPrefetch',
      hydrate: 'never',
      prefetch: 'idle',
    })
    const vnode = (await Island({})) as IslandVNode
    expect(vnode.type).toBe('pyreon-island')
    // `hydrate: 'never'` defeats client-side scheduling entirely — prefetch
    // is a no-op. The wrapper's branch correctly suppresses it.
    expect(vnode.props?.['data-prefetch']).toBeUndefined()
  })
})
