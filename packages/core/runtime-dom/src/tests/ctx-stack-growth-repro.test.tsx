/**
 * REGRESSION: context stack does not grow unboundedly under repeated reactive
 * remounts.
 *
 * User-reported symptom (`@pyreon/core@<=0.22.0`):
 *   1 GB heap; 33 effect snapshots × ~10,000 frames each; live context stack
 *   contained 321,024 entries but only 47 distinct provider Map instances.
 *   The same handful of providers were re-referenced thousands of times each.
 *
 * Root cause:
 *   `mountReactive`'s effect re-fire flow runs the previous-mount subtree
 *   cleanup INSIDE the effect's snapshot-restore window. The descendant's
 *   `onUnmount` calls `popContext()` (position-based, `stack.pop()`) — but
 *   the top of the stack at that moment is the snapshot-pushed frame, NOT
 *   the descendant's own provider frame. `popContext()` pops the snapshot
 *   frame; the descendant's frame is orphaned on the live stack. Geometric
 *   amplification across nested reactive boundaries × repeated toggles
 *   produces the 321k-frame state.
 *
 * Fix: `provide()` registers `onUnmount(removeContextFrame(frame))` — an
 * identity-based splice that finds the specific frame regardless of its
 * position on the stack.
 */
import { getContextStackLength, createContext, h, provide, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { mount } from '..'

describe('Context stack — growth under repeated remounts', () => {
  it('single reactive boundary cycling a Provider — stack stays bounded', () => {
    const Ctx = createContext<string>('root')
    const container = document.createElement('div')

    const baseLen = getContextStackLength()
    const cond = signal(true)

    function InnerProvider() {
      provide(Ctx, 'inner')
      return h('span', null, useContext(Ctx))
    }

    const App = () =>
      h('div', null, () => (cond() ? h(InnerProvider, null) : null))

    const unmount = mount(h(App, null), container)

    for (let i = 0; i < 1000; i++) {
      cond.set(false)
      cond.set(true)
    }

    const finalLen = getContextStackLength()
    expect(finalLen - baseLen).toBeLessThan(10)

    unmount()
  })

  it('REGRESSION: nested reactive boundaries with providers — no orphan frames', () => {
    // The exact shape that produced the 321k-entry live stack in 0.22.0:
    // two NESTED reactive boundaries, each containing a provider. The
    // outer's cleanup chain unmounts the inner; the inner's provider's
    // onUnmount popContext used to pop the wrong (snapshot) frame, orphaning
    // the provider's frame on the live stack.
    const A = createContext<string>('A_default')
    const B = createContext<string>('B_default')
    const container = document.createElement('div')
    const baseLen = getContextStackLength()

    const toggleA = signal(true)
    const toggleB = signal(true)

    function PA() {
      provide(A, 'A_value')
      return h('div', null, () => (toggleB() ? h(PB, null) : null))
    }
    function PB() {
      provide(B, 'B_value')
      return h('span', null, `${useContext(A)}/${useContext(B)}`)
    }

    const App = () =>
      h('div', null, () => (toggleA() ? h(PA, null) : null))

    const unmount = mount(h(App, null), container)

    // 500 full cycles. Without the fix, the stack grows ~1 frame per cycle
    // (502 after 500 iterations of toggleB/toggleA off/on).
    for (let i = 0; i < 500; i++) {
      toggleB.set(false)
      toggleB.set(true)
      toggleA.set(false)
      toggleA.set(true)
    }

    const finalLen = getContextStackLength()
    expect(finalLen - baseLen).toBeLessThan(10)

    unmount()
  })

  it('signal-driven re-mount of a provider — stack stays bounded across many updates', () => {
    const Ctx = createContext<string>('root')
    const container = document.createElement('div')
    const baseLen = getContextStackLength()
    const inner = signal('a')

    function InnerProvider() {
      provide(Ctx, inner())
      return h('span', null, useContext(Ctx))
    }

    const App = () => h('div', null, () => h(InnerProvider, null))
    const unmount = mount(h(App, null), container)

    for (let i = 0; i < 2000; i++) inner.set(`v${i}`)

    const finalLen = getContextStackLength()
    expect(finalLen - baseLen).toBeLessThan(10)

    unmount()
  })

  it('contextSnapshot used in restoreContextStack still finds inherited providers post-remount', () => {
    // Read-side correctness: the snapshot mechanism's whole point is that
    // useContext from a descendant inside a reactive boundary still finds
    // the ancestor provider. The fix must not break this.
    const Ctx = createContext<string>('root')
    const container = document.createElement('div')
    const cond = signal(true)
    const seen: string[] = []

    function Reader() {
      seen.push(useContext(Ctx))
      return h('span', null, useContext(Ctx))
    }

    function Provider() {
      provide(Ctx, 'inherited')
      return h('div', null, () => (cond() ? h(Reader, null) : null))
    }

    const unmount = mount(h(Provider, null), container)

    // Initial render must see 'inherited'
    expect(seen[seen.length - 1]).toBe('inherited')

    // Toggle a few times — every re-mount of Reader must see the inherited
    // value, NOT the default 'root'.
    for (let i = 0; i < 10; i++) {
      cond.set(false)
      cond.set(true)
    }
    // The most recent mount also saw inherited
    expect(seen[seen.length - 1]).toBe('inherited')

    unmount()
  })
})
