import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { createElement, Fragment } from './index'

/**
 * Real-browser smoke test for `@pyreon/preact-compat`.
 *
 * Per the test-environment-parity rule (`pyreon/require-browser-smoke-test`),
 * every browser-categorized package must ship at least one
 * `*.browser.test.*` file. This catches regressions that happy-dom unit
 * tests can hide: importing the public API and mounting through Preact's
 * `h` shim in real Chromium.
 */
describe('@pyreon/preact-compat — browser smoke', () => {
  it('mounts a Preact-style element via createElement', () => {
    const vnode = createElement('div', { id: 'preact', class: 'shim' }, 'hello, preact')
    const { container, unmount } = mountInBrowser(vnode)
    const el = container.querySelector('#preact')!
    expect(el.textContent).toBe('hello, preact')
    expect(el.classList.contains('shim')).toBe(true)
    unmount()
    expect(document.getElementById('preact')).toBeNull()
  })

  it('mounts a Fragment with multiple children', () => {
    const vnode = createElement(
      Fragment,
      null,
      createElement('span', { id: 'a' }, 'A'),
      createElement('span', { id: 'b' }, 'B'),
    )
    const { container, unmount } = mountInBrowser(vnode)
    expect(container.querySelector('#a')?.textContent).toBe('A')
    expect(container.querySelector('#b')?.textContent).toBe('B')
    unmount()
  })
})
