import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { createSignal, Portal } from './index'

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

  // Real shadow-DOM rendering can only be verified in a real browser
  // (happy-dom does not reflect Pyreon's mountChild through a ShadowRoot).
  it('Portal useShadow renders children inside a real shadow root + cleans up', () => {
    const mountTarget = document.createElement('div')
    document.body.appendChild(mountTarget)
    const { unmount } = mountInBrowser(
      h(Portal, {
        mount: mountTarget,
        useShadow: true,
        children: h('span', { id: 'sb-shadow' }, 'shadowed'),
      }),
    )
    const host = mountTarget.firstElementChild as HTMLElement
    expect(host.tagName.toLowerCase()).toBe('div')
    expect(host.shadowRoot).not.toBeNull()
    expect(host.shadowRoot!.querySelector('#sb-shadow')?.textContent).toBe('shadowed')
    unmount()
    // host removed on cleanup — no detached-host leak across mount cycles
    expect(mountTarget.firstElementChild).toBeNull()
    mountTarget.remove()
  })

  it('Portal isSVG renders children into an SVG-namespaced <g> host', () => {
    const mountTarget = document.createElement('div')
    document.body.appendChild(mountTarget)
    const { unmount } = mountInBrowser(
      h(Portal, {
        mount: mountTarget,
        isSVG: true,
        children: h('text', { id: 'sb-svg' }, 'in-svg'),
      }),
    )
    const host = mountTarget.firstElementChild!
    expect(host.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(host.tagName.toLowerCase()).toBe('g')
    expect(host.querySelector('#sb-svg')?.textContent).toBe('in-svg')
    unmount()
    mountTarget.remove()
  })
})
