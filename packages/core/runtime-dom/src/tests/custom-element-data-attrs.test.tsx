/**
 * `data-*` / `aria-*` on CUSTOM ELEMENTS must be real ATTRIBUTES, not JS
 * properties. The hyphenated-tag branch in `applyProp` sets properties so
 * pre-upgrade constructors pick up rich values — but routing `data-name`
 * through it produced `el['data-name']` (a property), which
 * `getAttribute('data-name')` / `dataset` / CSS attribute selectors / the
 * SSR-emitted HTML all disagree with. Real-world hit: the server-island
 * marker lost its `data-name` on every client mount, so the fragment
 * activator silently never fetched (caught by the ssr-node e2e).
 *
 * Bisect-verified: reverting the `data-`/`aria-` carve-out in props.ts
 * fails the first spec with `expected null to be 'CartBadge'`.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mount } from '../index'

describe('custom elements — data-*/aria-* are attributes', () => {
  it('data-* lands as a real attribute on a hyphenated tag', () => {
    const host = document.createElement('div')
    mount(
      h('pyreon-server-island' as never, { 'data-name': 'CartBadge', 'data-props': '{"a":1}' } as never),
      host,
    )
    const el = host.querySelector('pyreon-server-island')!
    expect(el.getAttribute('data-name')).toBe('CartBadge')
    expect(el.getAttribute('data-props')).toBe('{"a":1}')
    expect((el as HTMLElement).dataset.name).toBe('CartBadge')
  })

  it('aria-* lands as a real attribute on a hyphenated tag', () => {
    const host = document.createElement('div')
    mount(h('x-widget' as never, { 'aria-label': 'Cart' } as never), host)
    expect(host.querySelector('x-widget')!.getAttribute('aria-label')).toBe('Cart')
  })

  it('rich custom-element props still go through as properties', () => {
    const host = document.createElement('div')
    const payload = { rows: [1, 2, 3] }
    mount(h('x-grid' as never, { data: payload } as never), host)
    const el = host.querySelector('x-grid') as HTMLElement & { data?: unknown }
    expect(el.data).toBe(payload) // identity — property, not stringified attr
    expect(el.getAttribute('data')).toBeNull()
  })
})
