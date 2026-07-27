/**
 * Fresh-render duplicate-key dedup — regression lock.
 *
 * `handleFreshRender` uses the keyed `cache` itself as the membership set
 * instead of allocating a second `Set` (it is provably empty on entry, and
 * `renderInto` writes every key into it). These specs lock the OBSERVABLE
 * contract that optimisation must not change: a duplicate key is SKIPPED, so
 * the DOM holds one node per distinct key and the cache can't be corrupted by
 * a colliding write.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { mount } from '../index'

const containers: HTMLElement[] = []
function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  containers.push(el)
  return el
}
afterEach(() => {
  for (const el of containers.splice(0)) el.remove()
})

describe('<For> fresh render — duplicate keys are skipped', () => {
  test('renders ONE node per distinct key, not one per item', () => {
    const el = container()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const items = signal([{ id: 1 }, { id: 1 }, { id: 2 }])

    mount(
      h(
        'div',
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number }) => h('span', null, String(r.id)),
        }),
      ),
      el,
    )

    // 3 items, 2 distinct keys -> 2 spans. The duplicate is dropped.
    expect(el.querySelectorAll('span')).toHaveLength(2)
    expect(el.textContent).toBe('12')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Duplicate key'))
    warn.mockRestore()
  })

  test('a fully-distinct list is unaffected', () => {
    const el = container()
    const items = signal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    mount(
      h(
        'div',
        null,
        For({
          each: items,
          by: (r: { id: string }) => r.id,
          children: (r: { id: string }) => h('span', null, r.id),
        }),
      ),
      el,
    )
    expect(el.querySelectorAll('span')).toHaveLength(3)
    expect(el.textContent).toBe('abc')
  })
})
