/**
 * Coverage hardening — targets the branches uncovered when the CI
 * `Coverage (Full)` gate measured this package below its 95% statements
 * threshold (CI measures a few points under local — environment variance;
 * margin is the cure). Each spec exercises a real contract: the
 * `safeNotEqual` NaN semantics Svelte stores promise, the layout-effect
 * cleanup-before-rerun contract of the compat render context, and
 * `__loading` forwarding for lazy components through the jsx wrapper.
 */
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { getCurrentCtx, jsx, type RenderContext } from '../jsx-runtime'
import { get, writable } from '../index'

describe('writable — safeNotEqual NaN semantics (Svelte store contract)', () => {
  it('setting NaN over NaN does NOT notify (NaN treated as equal)', () => {
    const store = writable<number>(Number.NaN)
    let notifications = 0
    const unsub = store.subscribe(() => {
      notifications++
    })
    expect(notifications).toBe(1) // initial synchronous emit
    store.set(Number.NaN)
    expect(notifications).toBe(1) // NaN → NaN is "equal", no re-emit
    store.set(5)
    expect(notifications).toBe(2) // NaN → 5 notifies
    expect(get(store)).toBe(5)
    unsub()
  })
})

describe('render context — layout effect cleanup runs before re-execution', () => {
  it('a stable layout-effect entry has its previous cleanup invoked on rerun', () => {
    const el = document.createElement('div')
    const runs: string[] = []
    // Stable entry shared across renders — the cleanup written by run N
    // must be invoked at the top of run N+1 (the `if (entry.cleanup)`
    // branch in runLayoutEffects).
    const entry = {
      fn: () => {
        runs.push('run')
        return () => {
          runs.push('cleanup')
        }
      },
      deps: undefined as unknown[] | undefined,
      cleanup: undefined as (() => void) | undefined,
    }
    let ctx: RenderContext | null = null
    const Comp = () => {
      ctx = getCurrentCtx()
      ctx?.pendingLayoutEffects.push(entry)
      return jsx('div', { children: 'x' })
    }
    const dispose = pyreonMount(jsx(Comp, {}), el)
    // The compat accessor executes the component more than once during
    // mount, so the stable entry re-registers and its prior cleanup must
    // fire before each re-execution.
    expect(ctx).not.toBeNull()
    expect(runs[0]).toBe('run')
    expect(entry.cleanup).toBeTypeOf('function')
    expect(runs).toContain('cleanup')
    // Contract: the sequence strictly alternates run → cleanup → run …
    // (every re-execution is preceded by the previous run's cleanup).
    for (let i = 0; i < runs.length; i++) {
      expect(runs[i]).toBe(i % 2 === 0 ? 'run' : 'cleanup')
    }
    dispose()
  })
})

describe('jsx wrapper — __loading forwarding for lazy components', () => {
  it('carries __loading from the source component onto the wrapped one', () => {
    const Lazy = (() => jsx('div', { children: 'lazy' })) as unknown as Record<string, unknown>
    Lazy['__loading'] = true
    const vnode = jsx(Lazy as never, {}) as unknown as { type: Record<string, unknown> }
    expect(vnode.type['__loading']).toBe(true)
  })

  it('plain components do not gain a __loading marker', () => {
    const Plain = () => jsx('div', { children: 'p' })
    const vnode = jsx(Plain, {}) as unknown as { type: Record<string, unknown> }
    expect('__loading' in vnode.type).toBe(false)
  })
})
