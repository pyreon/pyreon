import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { derived, get, readable, writable } from './index'

/**
 * Real-browser smoke test for `@pyreon/svelte-compat`.
 *
 * Per the test-environment-parity rule (`pyreon/require-browser-smoke-test`),
 * every browser-categorized package must ship at least one
 * `*.browser.test.*` file. This catches regressions that happy-dom unit
 * tests can hide: importing the public API and exercising the Svelte
 * store contract end-to-end in real Chromium, including a store-driven
 * DOM mount.
 */
describe('@pyreon/svelte-compat — browser smoke', () => {
  it('writable round-trips set/update + subscribe', () => {
    const count = writable(0)
    const seen: number[] = []
    const unsub = count.subscribe((v) => seen.push(v))
    count.set(7)
    count.update((n) => n + 1)
    unsub()
    count.set(99) // ignored — unsubscribed
    expect(seen).toEqual([0, 7, 8])
    expect(get(count)).toBe(99)
  })

  it('derived recomputes from source stores', () => {
    const a = writable(2)
    const b = writable(3)
    const sum = derived([a, b], ([x, y]: [number, number]) => x + y)
    expect(get(sum)).toBe(5)
    a.set(10)
    expect(get(sum)).toBe(13)
  })

  it('readable start/stop notifier fires on 0→1 / 1→0', () => {
    let started = 0
    let stopped = 0
    const store = readable(1, () => {
      started++
      return () => {
        stopped++
      }
    })
    const u1 = store.subscribe(() => {})
    const u2 = store.subscribe(() => {})
    expect(started).toBe(1) // only on 0→1
    u1()
    expect(stopped).toBe(0) // still 1 subscriber
    u2()
    expect(stopped).toBe(1) // 1→0
  })

  it('mounts a store-driven element in real browser + cleans up', () => {
    const label = writable('svelte-compat')
    let current = ''
    label.subscribe((v) => (current = v))
    const vnode = h('div', { id: 'svelte-compat' }, current)
    const { container, unmount } = mountInBrowser(vnode)
    const el = container.querySelector('#svelte-compat')!
    expect(el.textContent).toBe('svelte-compat')
    unmount()
    expect(document.getElementById('svelte-compat')).toBeNull()
  })
})
