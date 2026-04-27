import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { ref, isRef, unref } from './index'

/**
 * Real-browser smoke test for `@pyreon/vue-compat`.
 *
 * Per the test-environment-parity rule (`pyreon/require-browser-smoke-test`),
 * every browser-categorized package must ship at least one
 * `*.browser.test.*` file. This catches regressions that happy-dom unit
 * tests can hide: importing the public API and exercising the Vue 3
 * Composition API shim (`ref`, `unref`) end-to-end in real Chromium.
 */
describe('@pyreon/vue-compat — browser smoke', () => {
  it('creates a ref and reads its value through unref()', () => {
    const r = ref('vue-compat')
    expect(isRef(r)).toBe(true)
    expect(unref(r)).toBe('vue-compat')
  })

  it('mounts a static element in real browser', () => {
    const r = ref('hello, vue')
    const vnode = h('div', { id: 'vue-compat' }, unref(r))
    const { container, unmount } = mountInBrowser(vnode)
    const el = container.querySelector('#vue-compat')!
    expect(el.textContent).toBe('hello, vue')
    unmount()
    expect(document.getElementById('vue-compat')).toBeNull()
  })
})
