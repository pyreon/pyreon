import type { ComponentFn } from '@pyreon/core'
import { createContext, h, nativeCompat, provide, useContext } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { jsx } from '../jsx-runtime'

// Per-compat unit-level regression test for the marker-bypass contract.
// See `react-compat/src/tests/native-marker-bypass.test.tsx` for the full
// rationale + bisect-verification notes.
//
// Solid-compat note: solid-compat's jsx() has TWO native-routing paths in
// sequence — first the hardcoded `_nativeComponents` Set as defense-in-depth
// (Show, For, Switch, Match, Suspense, ErrorBoundary), then the marker
// check. These tests use USER-defined NativeProvider/Consumer (NOT in the
// hardcoded set), so the bypass MUST come from the marker path
// (`isNativeCompat(type)`), proving the marker check fires correctly.
//
// Bisect-verified per file: removing the `if (isNativeCompat(type))` branch
// from solid-compat's jsx-runtime (while keeping the `_nativeComponents`
// set check) causes test #1 to fail with
// `expected [Function wrapped] to be [Function Native]`.

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('solid-compat — nativeCompat() marker bypass', () => {
  it('jsx() routes marked components through h() directly (no wrapper)', () => {
    const Native = (props: { children?: unknown }) => h('div', null, props.children as never)
    nativeCompat(Native)

    const vnode = jsx(Native, {})

    expect(vnode.type).toBe(Native)
  })

  it('jsx() wraps UNMARKED components (control — bypass is selective)', () => {
    const Unmarked = (props: { children?: unknown }) => h('div', null, props.children as never)

    const vnode = jsx(Unmarked, {})

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
    expect(span?.getAttribute('data-value')).toBe('native')
    expect(span?.textContent).toBe('native')
  })
})
