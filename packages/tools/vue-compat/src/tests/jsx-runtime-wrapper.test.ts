import { nativeCompat } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it, vi } from 'vitest'
import { onMounted, onUnmounted } from '../index'
import { jsx } from '../jsx-runtime'

// Coverage gap closed in PR #323. Exercises the Vue-compat wrapper
// (`wrapCompatComponent`) end-to-end: JSX → mount → lifecycle hooks
// → unmount cleanup. Pins the wrapper's setup-and-teardown contract;
// fine-grained reactivity behavior is covered by the broader
// vue-compat.test.ts integration suite.

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

const tick = () => new Promise<void>((r) => queueMicrotask(() => r()))

describe('vue-compat — wrapCompatComponent (jsx-runtime)', () => {
  it('caches the wrapper per source-fn identity (same wrapper on repeat jsx calls)', () => {
    const Comp = () => jsx('div', { children: 'hi' })
    const a = jsx(Comp, {})
    const b = jsx(Comp, {})
    // Both vnodes should reference the same wrapped component (the
    // _wrapperCache WeakMap reuses by source-fn identity)
    expect(a.type).toBe(b.type)
  })

  it('produces distinct wrappers for distinct source functions', () => {
    const A = () => jsx('div', { children: 'a' })
    const B = () => jsx('div', { children: 'b' })
    expect(jsx(A, {}).type).not.toBe(jsx(B, {}).type)
  })

  it('mounts a Vue-style component and renders into the container', () => {
    const Comp = () => jsx('div', { children: 'mounted-via-vue-compat' })
    const c = container()
    mount(jsx(Comp, {}), c)
    expect(c.textContent).toContain('mounted-via-vue-compat')
  })

  it('runs onMounted callback after first render', async () => {
    const mountedSpy = vi.fn()
    const Comp = () => {
      onMounted(mountedSpy)
      return jsx('div', { children: 'hi' })
    }

    const c = container()
    mount(jsx(Comp, {}), c)
    await tick()
    await tick()
    expect(mountedSpy).toHaveBeenCalledTimes(1)
  })

  it('runs onUnmounted callback after disposal', async () => {
    const unmountedSpy = vi.fn()
    const Comp = () => {
      onUnmounted(unmountedSpy)
      return jsx('div', { children: 'hi' })
    }

    const c = container()
    const dispose = mount(jsx(Comp, {}), c)
    await tick()
    expect(unmountedSpy).not.toHaveBeenCalled()

    dispose()
    expect(unmountedSpy).toHaveBeenCalledTimes(1)
  })

  it('handles components with children prop (passes children through to wrapped fn)', () => {
    const Wrapper = (props: { children?: string }) =>
      jsx('section', { children: props.children ?? '' })
    const c = container()
    mount(jsx(Wrapper, { children: 'inner' }), c)
    expect(c.textContent).toContain('inner')
  })

  it('handles components with no props', () => {
    const Comp = () => jsx('div', { children: 'noprops' })
    const c = container()
    mount(jsx(Comp, {}), c)
    expect(c.textContent).toContain('noprops')
  })

  it('skips wrapping for components marked via nativeCompat() (Vue-side parity with React/Preact/Solid compat)', () => {
    // Pre-PR-2 vue-compat's jsx() had no NATIVE marker check — even marked
    // components got wrapCompatComponent applied, which broke Pyreon framework
    // components composed inside Vue-style code (their `provide()` /
    // `onMount()` calls fired outside Pyreon's setup frame). PR 2 added the
    // missing check at the same site as react/preact/solid compat.
    //
    // Bisect-verified: removing the `if (isNativeCompat(type))` branch from
    // jsx-runtime.ts puts vue-compat back in the broken state — this test
    // fails because the wrapped component's identity no longer matches the
    // native source fn.
    const Native = () => jsx('div', { children: 'native' })
    nativeCompat(Native)
    const vnode = jsx(Native, {})
    // Marker hit: jsx() routes through h() directly with the SOURCE fn,
    // never through wrapCompatComponent. So vnode.type === Native.
    expect(vnode.type).toBe(Native)
  })
})
