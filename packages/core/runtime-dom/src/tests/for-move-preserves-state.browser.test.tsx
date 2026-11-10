/**
 * Keyed reorders move rows with the DOM's state-preserving `moveBefore`
 * (`moveNode` in nodes.ts), so a moved row keeps focus — a plain
 * `insertBefore` removes the node first, which blurs it. Real Chromium only:
 * happy-dom has no `moveBefore` and takes the `insertBefore` fallback.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { query } from '@pyreon/test-utils'
import { describe, expect, it } from 'vitest'

describe('<For> moves keep row state (real Chromium)', () => {
  it('the browser under test has moveBefore (otherwise this spec proves nothing)', () => {
    expect(typeof (Element.prototype as { moveBefore?: unknown }).moveBefore).toBe('function')
  })

  it('a focused input in a moved row stays focused through a swap', () => {
    const ids = signal([1, 2, 3, 4, 5, 6])
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(
      h('ul', null, h(For, { each: ids, by: (id: number) => id, children: (id: number) => h('li', null, h('input', { id: `in-${id}` })) })),
      host,
    )
    const input = query<HTMLInputElement>(host, '#in-2')
    input.focus()
    expect(document.activeElement).toBe(input)
    ids.set([1, 5, 3, 4, 2, 6]) // swap 2 and 5
    expect([...host.querySelectorAll('input')].map((i) => i.id)).toEqual(['in-1', 'in-5', 'in-3', 'in-4', 'in-2', 'in-6'])
    expect(host.querySelector('#in-2')).toBe(input)
    expect(document.activeElement).toBe(input)
    ids.set([...ids()].reverse()) // a full reorder through the LIS path
    expect(document.activeElement).toBe(input)
    dispose()
    host.remove()
  })

  it('a keyed .map accessor keeps focus the same way', () => {
    const ids = signal([1, 2, 3, 4])
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h('ul', null, () => ids().map((id) => h('li', { key: id }, h('input', { id: `k-${id}` })))), host)
    const input = query<HTMLInputElement>(host, '#k-1')
    input.focus()
    ids.set([2, 3, 4, 1]) // the LIS keeps 2,3,4 and moves 1
    expect(host.querySelector('#k-1')).toBe(input)
    expect(document.activeElement).toBe(input)
    dispose()
    host.remove()
  })
})
