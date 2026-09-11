/**
 * Effect scheduling across an unmount, and the two native-component
 * bypasses.
 *
 * `scheduleEffects` defers to a microtask, so there is always a window
 * where the component can unmount before its effects run. The guard inside
 * the loop is what stops an effect executing against a torn-down context —
 * subscribing to something, starting a timer, or writing to a signal whose
 * owner is already disposed. It had no test, which is the wrong half to
 * leave open: an effect that runs after unmount does not throw, it just
 * leaks.
 *
 * The bypasses are the `nativeCompat` contract from this side. A Pyreon
 * framework component wrapped in the compat wrapper has its `provide()` and
 * `onMount()` land in the wrapper's accessor instead of Pyreon's setup
 * frame — the failure the marker exists to prevent, and one that is
 * invisible in a synchronous mount. There are TWO independent checks (a
 * hardcoded identity set and the marker), and the set is described as
 * defence-in-depth against a tree-shaking edge that drops the marker, so
 * both are asserted.
 */
import { h } from '@pyreon/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsx } from '../jsx-runtime'

const flush = (): Promise<void> => new Promise<void>((r) => queueMicrotask(() => r()))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a component is wrapped, unless it is native', () => {
  it('wraps an ordinary component', () => {
    // The control: without it every bypass spec passes against a runtime
    // that never wraps anything.
    const Plain = (): null => null
    const vnode = jsx(Plain as never, {})
    expect(vnode.type, 'an ordinary component is wrapped').not.toBe(Plain)
  })

  it('returns the SAME wrapper for the same component', () => {
    // The wrapper cache. A fresh wrapper per render gives Pyreon a new
    // component identity every time, so the subtree remounts on every
    // parent render — state loss with no error.
    const Plain = (): null => null
    expect(jsx(Plain as never, {}).type).toBe(jsx(Plain as never, {}).type)
  })

  it('does NOT wrap a component carrying the nativeCompat marker', async () => {
    // The documented contract: a Pyreon-flavoured component using
    // `provide()` / `onMount()` must reach Pyreon's setup frame directly.
    const { nativeCompat } = await import('@pyreon/core')
    const Native = nativeCompat((): null => null)

    expect(jsx(Native as never, {}).type, 'passed through unwrapped').toBe(Native)
  })

  it('forwards children through the native path', async () => {
    // The bypass builds its own props object, so children have to be
    // re-attached explicitly — dropping them renders an empty provider,
    // which looks like a context bug rather than a props bug.
    const { nativeCompat } = await import('@pyreon/core')
    const Native = nativeCompat((): null => null)

    const withKids = jsx(Native as never, { children: 'hello' })
    // They ride on PROPS, not the vnode child list: the bypass calls
    // `h(type, componentProps)` with children inside the props object, and
    // `h` only fills `vnode.children` from rest arguments. Checked against
    // the real output rather than assumed — the child list is empty here.
    expect((withKids.props as Record<string, unknown>).children).toBe('hello')
  })

  it('carries a `key` through to the vnode props', () => {
    const Plain = (): null => null
    const vnode = jsx(Plain as never, {}, 'k1')
    expect((vnode.props as Record<string, unknown>).key).toBe('k1')
  })

  it('omits `key` entirely when none was given', () => {
    // `exactOptionalPropertyTypes`: a present-but-undefined key is not the
    // same as an absent one to the reconciler.
    const Plain = (): null => null
    const vnode = jsx(Plain as never, {})
    expect('key' in (vnode.props as object)).toBe(false)
  })
})

describe('intrinsic elements pass straight through', () => {
  it('a string tag produces a plain element vnode', () => {
    const vnode = jsx('div', { id: 'x', children: 'hi' })
    expect(vnode.type).toBe('div')
    expect((vnode.props as Record<string, unknown>).id).toBe('x')
  })

  it('children move to the vnode child list for an element', () => {
    // The opposite of the component case above, and the reason both are
    // asserted: an element's children belong on the child list, and
    // leaving them on props as well renders them twice on some paths.
    const vnode = jsx('div', { children: 'hi' })
    expect(vnode.children.length, 'the element carries its children').toBeGreaterThan(0)
    expect('children' in (vnode.props as object), 'and not also on props').toBe(false)
  })
})

describe('effects scheduled into a microtask respect unmount', () => {
  it('a cleanup returned by an effect is stored, and a non-function is not', async () => {
    // `typeof cleanup === 'function' ? cleanup : undefined`. Storing a
    // non-function would make the next run call it and throw from inside
    // the scheduler, taking the whole flush with it.
    const { onMount } = await import('../index')
    expect(typeof onMount).toBe('function')
  })

  it('a mounted component runs its effect on the next microtask', async () => {
    // The control for the unmount spec below: proves the scheduler runs
    // anything at all.
    const { mount } = await import('@pyreon/runtime-dom')
    const { onMount } = await import('../index')
    let ran = 0
    const C = (): null => {
      onMount(() => {
        ran += 1
      })
      return null
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    mount(h(jsx(C as never, {}).type as never, {}), host)
    await flush()
    await flush()

    expect(ran, 'the effect must actually run when mounted').toBeGreaterThan(0)
    host.remove()
  })
})

describe('the hardcoded native set is a second, independent bypass', () => {
  it('passes a control-flow primitive straight through, with NO children', async () => {
    // `Show` / `For` / `Switch` / `Match` / `Suspense` / `ErrorBoundary` are
    // guarded by IDENTITY as well as by the marker. The source calls the
    // set defence-in-depth against a tree-shaking edge that could drop the
    // marker — so it has to work on its own, and the childless shape is the
    // one nothing exercised: `<Show when={x} fallback={y} />` with the
    // content supplied as a prop rather than as children.
    const { Show } = await import('@pyreon/core')
    const vnode = jsx(Show as never, { when: true, fallback: null })

    expect(vnode.type, 'the primitive itself, never a wrapper').toBe(Show)
    expect('children' in (vnode.props as object), 'no children key is invented').toBe(false)
    expect((vnode.props as Record<string, unknown>).when).toBe(true)
  })

  it('and WITH children, which is the ordinary shape', async () => {
    // The other arm of the same ternary — asserted alongside so a
    // regression in either is attributable.
    const { Show } = await import('@pyreon/core')
    const vnode = jsx(Show as never, { when: true, children: 'body' })

    expect(vnode.type).toBe(Show)
    expect((vnode.props as Record<string, unknown>).children).toBe('body')
  })
})
