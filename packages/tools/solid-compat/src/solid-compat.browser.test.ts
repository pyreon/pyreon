import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { createSignal } from './index'

/**
 * Real-browser smoke test for `@pyreon/solid-compat`.
 *
 * Per the test-environment-parity rule (`pyreon/require-browser-smoke-test`),
 * every browser-categorized package must ship at least one
 * `*.browser.test.*` file. This catches regressions that happy-dom unit
 * tests can hide: importing the public API and exercising the SolidJS
 * `createSignal` shim end-to-end in real Chromium.
 */
describe('@pyreon/solid-compat — browser smoke', () => {
  it('createSignal returns [getter, setter] that round-trip', () => {
    const [count, setCount] = createSignal(0)
    expect(count()).toBe(0)
    setCount(7)
    expect(count()).toBe(7)
  })

  it('mounts a static element in real browser', () => {
    const [name] = createSignal('solid-compat')
    const vnode = h('div', { id: 'solid-compat' }, name())
    const { container, unmount } = mountInBrowser(vnode)
    const el = container.querySelector('#solid-compat')!
    expect(el.textContent).toBe('solid-compat')
    unmount()
    expect(document.getElementById('solid-compat')).toBeNull()
  })
})
