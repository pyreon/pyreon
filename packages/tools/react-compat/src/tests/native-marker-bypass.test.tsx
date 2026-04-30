import type { ComponentFn } from '@pyreon/core'
import { createContext, h, nativeCompat, provide, useContext } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { jsx } from '../jsx-runtime'

// Per-compat unit-level regression test for the marker-bypass contract.
//
// PR #422 wired `isNativeCompat(type)` into react-compat's `jsx()` runtime.
// PR #425 added `nativeCompat()` calls to 24 framework components. This file
// proves the bypass actually works at the unit-test layer:
//
//   1. **Bypass identity** (load-bearing): `jsx(NativeProvider, {})` returns
//      vnode with `type === NativeProvider` (not the wrapper), proving the
//      marker check fires.
//   2. **Wrap-when-unmarked** (load-bearing): UNMARKED components still go
//      through `wrapCompatComponent` — proves the bypass is selective, not
//      blanket.
//   3. **Mount + provide() smoke** (sanity, not bisect-load-bearing): the
//      marked Provider mounts cleanly through compat-mode jsx() and its
//      `provide()` reaches the descendant Consumer. Note: synchronous mount
//      preserves provide() context even WITH the wrapper (provide() pushes
//      onto the global context stack regardless), so removing the marker
//      from a Provider in this test won't fail — the actual bug post-mark
//      removal is multi-render-cycle (signal change re-fires the wrapper's
//      accessor → provide() in re-run lands in stale stack). PR #427's e2e
//      gate covers that shape end-to-end against real router state.
//
// Bisect-verified: removing the `if (isNativeCompat(type))` branch from
// jsx-runtime.ts causes test #1 to fail with
// `expected [Function wrapped] to be [Function Native]`.

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('react-compat — nativeCompat() marker bypass', () => {
  it('jsx() routes marked components through h() directly (no wrapper)', () => {
    const Native = (props: { children?: unknown }) => h('div', null, props.children as never)
    nativeCompat(Native)

    const vnode = jsx(Native, {})

    // Bypass: vnode.type IS the source fn, not a cached wrapper.
    expect(vnode.type).toBe(Native)
  })

  it('jsx() wraps UNMARKED components (control — bypass is selective)', () => {
    const Unmarked = (props: { children?: unknown }) => h('div', null, props.children as never)
    // No nativeCompat() call.

    const vnode = jsx(Unmarked, {})

    // Wrapper: vnode.type is the cached wrapper, NOT the source fn.
    expect(vnode.type).not.toBe(Unmarked)
    expect(typeof vnode.type).toBe('function')
  })

  it('marked Provider mounts inside Pyreon setup frame — provide() reaches descendants', () => {
    const Ctx = createContext<string>('default')

    const Provider: ComponentFn = (props) => {
      provide(Ctx, props.value as string)
      return props.children as never
    }
    nativeCompat(Provider)

    const Consumer: ComponentFn = () => {
      const value = useContext(Ctx)
      return h('span', { 'data-value': value }, value)
    }
    nativeCompat(Consumer)

    const el = container()
    mount(jsx(Provider, { value: 'native', children: jsx(Consumer, {}) }), el)

    const span = el.querySelector('span')
    // Pre-PR-3, the Provider's body would run in the compat wrapper's
    // runUntracked accessor and `provide()` would land in a torn-down
    // context stack. Consumer would read 'default'. Post-PR-3, the marker
    // routes Provider through h() directly, the body runs inside Pyreon's
    // setup frame, provide() reaches descendants. Consumer reads 'native'.
    expect(span?.getAttribute('data-value')).toBe('native')
    expect(span?.textContent).toBe('native')
  })
})
