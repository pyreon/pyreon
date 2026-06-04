// @vitest-environment happy-dom
/**
 * Coverage for the CLIENT-side path of `island()`:
 *   - Invoke the island component under happy-dom (`typeof document !== 'undefined'`)
 *   - hydrate: 'never' returns the bare marker directly
 *   - hydrate: 'visible'|'idle'|etc. schedules client-side hydration
 *
 * Pre-fix: lines 157-176 were uncov because the test env was node-only.
 */
import { describe, expect, it } from 'vitest'
import { island } from '../island'
import type { ComponentFn } from '@pyreon/core'

const dummyLoader = () =>
  Promise.resolve({ default: (() => null) as unknown as ComponentFn<Record<string, unknown>> })

describe('island() — client-side path under happy-dom', () => {
  it('hydrate=never returns bare <pyreon-island> immediately (line 157)', () => {
    const Island = island(dummyLoader, { name: 'NeverIsland', hydrate: 'never' })
    const vnode = Island({}) as { type?: unknown; props?: Record<string, unknown> }
    expect(vnode.type).toBe('pyreon-island')
    // No `ref` attached for never-strategy.
    expect(vnode.props?.ref).toBeUndefined()
  })

  it('hydrate=visible returns <pyreon-island> with ref + onMount scheduling (lines 158-176)', () => {
    const Island = island(dummyLoader, { name: 'VisibleIsland', hydrate: 'visible' })
    const vnode = Island({ message: 'hello' }) as {
      type?: unknown
      props?: Record<string, unknown>
    }
    expect(vnode.type).toBe('pyreon-island')
    expect(typeof vnode.props?.ref).toBe('function')
  })

  it('hydrate=interaction also returns ref-bearing marker', () => {
    const Island = island(dummyLoader, { name: 'IntIsland', hydrate: 'interaction' })
    const vnode = Island({}) as { type?: unknown; props?: Record<string, unknown> }
    expect(vnode.type).toBe('pyreon-island')
    expect(typeof vnode.props?.ref).toBe('function')
  })

  it('prefetch=idle path engages alongside visible hydrate', () => {
    const Island = island(dummyLoader, {
      name: 'PrefetchIsland',
      hydrate: 'visible',
      prefetch: 'idle',
    })
    const vnode = Island({}) as { type?: unknown }
    expect(vnode.type).toBe('pyreon-island')
  })

  it('default prefetch=none branch (skips schedulePrefetch in onMount)', () => {
    const Island = island(dummyLoader, { name: 'NoPrefetchIsland', hydrate: 'idle' })
    const vnode = Island({}) as { type?: unknown }
    expect(vnode.type).toBe('pyreon-island')
  })
})
