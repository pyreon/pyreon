import { type ComponentFn, h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { defineAsyncComponent, ref, isRef, unref } from './index'

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

describe('@pyreon/vue-compat — defineAsyncComponent options in real Chromium', () => {
  const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

  it('shows loadingComponent after `delay`, then swaps in the loaded component', async () => {
    let resolve!: (m: { default: ComponentFn }) => void
    const A = defineAsyncComponent({
      loader: () => new Promise<{ default: ComponentFn }>((r) => (resolve = r)),
      loadingComponent: () => h('i', { id: 'async-loading' }, 'loading'),
      delay: 20,
    })
    const { container, unmount } = mountInBrowser(h(A, {}))
    expect(container.querySelector('#async-loading')).toBeNull()
    await tick(60)
    expect(container.querySelector('#async-loading')).not.toBeNull()
    resolve({ default: () => h('b', { id: 'async-loaded' }, 'ready') })
    await tick()
    expect(container.querySelector('#async-loading')).toBeNull()
    expect(container.querySelector('#async-loaded')?.textContent).toBe('ready')
    unmount()
  })

  it('renders errorComponent with the timeout error', async () => {
    const A = defineAsyncComponent({
      loader: () => new Promise<ComponentFn>(() => {}),
      errorComponent: (p: { error: Error }) => h('u', { id: 'async-error' }, p.error.message),
      timeout: 20,
    })
    const { container, unmount } = mountInBrowser(h(A, {}))
    await tick(60)
    expect(container.querySelector('#async-error')?.textContent).toBe('Async component timed out after 20ms.')
    unmount()
  })
})
