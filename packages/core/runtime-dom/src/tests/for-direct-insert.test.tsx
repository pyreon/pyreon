/**
 * Regression lock — `<For>` mounts new rows STRAIGHT into the live parent
 * (fresh render, full replace, contiguous insert) instead of staging them in a
 * DocumentFragment and moving the fragment in afterwards.
 *
 * Staging parented every row twice; the direct shape measured 0.99 → 0.905 ms
 * (1k fresh) and 10.47 → 9.50 ms (10k fresh) of JS in real Chromium. The
 * observable contract that distinguishes the two shapes is WHERE a row is when
 * its own mount-time code runs: staged, a row `ref` saw a node inside a
 * detached fragment (`isConnected === false`, zero-sized boxes); direct, it
 * sees the row already in the document, in its final parent, after the rows
 * before it. Every spec here asserts that — plus the final DOM order, which
 * both shapes must produce.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '../index'

interface Item {
  id: number
}

const containers: HTMLElement[] = []
afterEach(() => {
  for (const c of containers) c.remove()
  containers.length = 0
})

const setup = (ids: number[], withSibling: boolean) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  containers.push(container)
  const items = signal<Item[]>(ids.map((id) => ({ id })))
  const seen: Array<{ id: number; connected: boolean; parentIsList: boolean; prevId: string | null }> = []
  let list!: HTMLElement
  const children = [
    h(For, {
      each: items,
      by: (r: Item) => r.id,
      children: (r: Item) =>
        h('li', {
          'data-id': String(r.id),
          ref: (el: HTMLElement | null) => {
            if (!el) return
            const prev = el.previousElementSibling as HTMLElement | null
            seen.push({
              id: r.id,
              connected: el.isConnected,
              parentIsList: el.parentNode === list,
              prevId: prev ? prev.getAttribute('data-id') : null,
            })
          },
        }),
    }),
  ]
  if (withSibling) children.push(h('li', { 'data-id': 'tail' }))
  mount(
    h('ul', { ref: (el: HTMLElement | null) => el && (list = el) }, ...children),
    container,
  )
  const order = () => [...container.querySelectorAll('li')].map((li) => li.getAttribute('data-id'))
  return { items, seen, order }
}

describe('<For> direct insertion — rows are live while they mount', () => {
  for (const withSibling of [false, true]) {
    const label = withSibling ? 'shared parent' : 'owns parent'

    it(`fresh render (${label})`, () => {
      // Start empty so the fresh render runs against the MOUNTED list (the
      // very first render happens while the <ul> itself is still detached).
      const { items, seen, order } = setup([], withSibling)
      items.set([{ id: 1 }, { id: 2 }, { id: 3 }])
      expect(seen.map((s) => s.connected)).toEqual([true, true, true])
      expect(seen.map((s) => s.parentIsList)).toEqual([true, true, true])
      // Each row lands after the previous one — not all at once at the end.
      expect(seen.map((s) => s.prevId)).toEqual([null, '1', '2'])
      expect(order()).toEqual(withSibling ? ['1', '2', '3', 'tail'] : ['1', '2', '3'])
    })

    it(`full replace (${label})`, () => {
      const { items, seen, order } = setup([1, 2], withSibling)
      seen.length = 0
      items.set([{ id: 7 }, { id: 8 }, { id: 9 }])
      expect(seen.map((s) => s.connected)).toEqual([true, true, true])
      expect(seen.map((s) => s.parentIsList)).toEqual([true, true, true])
      // The old rows are gone BEFORE the new ones mount.
      expect(seen.map((s) => s.prevId)).toEqual([null, '7', '8'])
      expect(order()).toEqual(withSibling ? ['7', '8', '9', 'tail'] : ['7', '8', '9'])
    })

    it(`contiguous append / prepend / middle insert (${label})`, () => {
      const { items, seen, order } = setup([1, 2], withSibling)
      seen.length = 0
      items.set([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
      expect(seen.map((s) => [s.id, s.connected, s.prevId])).toEqual([
        [3, true, '2'],
        [4, true, '3'],
      ])
      seen.length = 0
      items.set([{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
      expect(seen.map((s) => [s.id, s.connected, s.prevId])).toEqual([[0, true, null]])
      seen.length = 0
      items.set([{ id: 0 }, { id: 1 }, { id: 5 }, { id: 2 }, { id: 3 }, { id: 4 }])
      expect(seen.map((s) => [s.id, s.connected, s.parentIsList, s.prevId])).toEqual([
        [5, true, true, '1'],
      ])
      const tail = withSibling ? ['tail'] : []
      expect(order()).toEqual(['0', '1', '5', '2', '3', '4', ...tail])
    })
  }
})
