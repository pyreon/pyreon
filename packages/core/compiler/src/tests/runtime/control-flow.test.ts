// @vitest-environment happy-dom
/// <reference lib="dom" />
import { For, h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'

/**
 * Compiler-runtime tests — control-flow primitives.
 *
 * These tests verify `<For>` and `<Show>` integrate correctly with the
 * Pyreon mount path. They use direct `h()` calls instead of JSX because
 * the harness's `compileAndMount` runs only the template-optimization
 * pass of `@pyreon/compiler` — the bundler-level JSX → `h()` transform
 * (normally done by Vite's esbuild) does NOT run in the harness, so JSX
 * containing components like `<For>` would be left raw and unparseable.
 *
 * `<Match>`, `<Suspense>`, `<ErrorBoundary>` are deferred to Phase C1
 * because they need real Chromium for the async / boundary shapes.
 */

describe('compiler-runtime — control flow (h() form)', () => {
  it('<For> renders each item and reacts to signal updates', async () => {
    const items = signal([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ])
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { id: 'root' },
        h(For, {
          each: items,
          by: (i: { id: number; name: string }) => i.id,
          children: (i: { name: string }) => h('span', null, i.name),
        }),
      ),
    )
    const root = container.querySelector('#root')!
    expect(root.querySelectorAll('span').length).toBe(2)
    expect(root.textContent).toBe('ab')
    items.set([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' },
    ])
    await flush()
    expect(root.querySelectorAll('span').length).toBe(3)
    expect(root.textContent).toBe('abc')
    unmount()
  })

  it('<For> handles removal correctly', async () => {
    const items = signal([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' },
    ])
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { id: 'root' },
        h(For, {
          each: items,
          by: (i: { id: number; name: string }) => i.id,
          children: (i: { name: string }) => h('span', null, i.name),
        }),
      ),
    )
    const root = container.querySelector('#root')!
    expect(root.querySelectorAll('span').length).toBe(3)
    items.set([{ id: 2, name: 'b' }])
    await flush()
    expect(root.querySelectorAll('span').length).toBe(1)
    expect(root.textContent).toBe('b')
    unmount()
  })

  it('<Show> conditionally renders based on signal', async () => {
    const visible = signal(true)
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { id: 'root' },
        h(Show, { when: () => visible(), children: h('span', { id: 'x' }, 'visible') }),
      ),
    )
    const root = container.querySelector('#root')!
    expect(root.querySelector('#x')).not.toBeNull()
    visible.set(false)
    await flush()
    expect(root.querySelector('#x')).toBeNull()
    visible.set(true)
    await flush()
    expect(root.querySelector('#x')).not.toBeNull()
    unmount()
  })

  it('<Show> with fallback renders fallback when condition is false', async () => {
    const flag = signal(false)
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { id: 'root' },
        h(Show, {
          when: () => flag(),
          fallback: h('span', { id: 'fb' }, 'fallback'),
          children: h('span', { id: 'x' }, 'visible'),
        }),
      ),
    )
    const root = container.querySelector('#root')!
    expect(root.querySelector('#fb')).not.toBeNull()
    expect(root.querySelector('#x')).toBeNull()
    flag.set(true)
    await flush()
    expect(root.querySelector('#fb')).toBeNull()
    expect(root.querySelector('#x')).not.toBeNull()
    unmount()
  })

  it('<Show> with value prop (not accessor) accepts boolean', () => {
    // Per #352's `<Show>` defensive normalization fix — `when` accepts
    // both `() => boolean` accessor AND raw boolean (for static cases +
    // signal auto-call edge case).
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { id: 'root' },
        h(Show, { when: true, children: h('span', { id: 'x' }, 'on') }),
      ),
    )
    expect(container.querySelector('#x')).not.toBeNull()
    unmount()
  })

  it('nested control flow: <Show> inside <For>', async () => {
    const items = signal([
      { id: 1, name: 'a', visible: true },
      { id: 2, name: 'b', visible: false },
      { id: 3, name: 'c', visible: true },
    ])
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { id: 'root' },
        h(For, {
          each: items,
          by: (i: { id: number }) => i.id,
          children: (i: { name: string; visible: boolean }) =>
            h(Show, { when: () => i.visible, children: h('span', null, i.name) }),
        }),
      ),
    )
    const root = container.querySelector('#root')!
    expect(root.textContent).toBe('ac')
    unmount()
  })
})
