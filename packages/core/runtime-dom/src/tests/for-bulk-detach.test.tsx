/**
 * BULK DETACH: a `<For>` mounted inside a freshly built element skips its rows'
 * one-by-one DOM removals on teardown, because that element leaves the
 * document as a unit right after. These specs lock both halves:
 *
 *  - the saving — a nested-`<For>` table unmounts with a handful of
 *    `removeChild` calls, not one per row and per cell;
 *  - the safety — every row's effects are still disposed, a `<For>` that owns
 *    a LIVE parent still removes its rows, and a `<Portal>` inside a row still
 *    clears its live target.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { For, Portal, Show, h } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { mount } from '../index'

interface Row {
  id: number
}
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i }))
const COLS = [0, 1, 2]

/** Count `removeChild` calls made while `fn` runs. */
function countRemovals(fn: () => void): number {
  const orig = Node.prototype.removeChild
  let n = 0
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    n++
    return orig.call(this, child) as T
  }
  try {
    fn()
  } finally {
    Node.prototype.removeChild = orig
  }
  return n
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('<For> bulk detach', () => {
  it('a nested-<For> table unmounts without removing rows and cells one at a time', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const unmount = mount(
      h(
        'table',
        null,
        h(
          'tbody',
          null,
          h(For, {
            each: () => rows(50),
            by: (r: Row) => r.id,
            children: (r: Row) =>
              h('tr', null, h(For, { each: () => COLS, by: (c: number) => c, children: (c: number) => h('td', null, `${r.id}:${c}`) })),
          }),
        ),
      ),
      container,
    )
    expect(container.querySelectorAll('td')).toHaveLength(150)
    const removals = countRemovals(unmount)
    // Without bulk detach: 50 rows + 150 cells + 100 inner markers + 2 outer
    // markers, one call each. With it, only the table's own removal.
    expect(removals).toBeLessThan(10)
    expect(container.childNodes.length).toBe(0)
  })

  it("still disposes every row's effects", () => {
    const tick = signal(0)
    let runs = 0
    // A row COMPONENT owns its effects (its scope disposes them).
    const RowItem = (props: { id: number }) => {
      effect(() => {
        tick()
        runs++
      })
      return h('li', null, String(props.id))
    }
    const container = document.createElement('div')
    const unmount = mount(
      h(
        'ul',
        null,
        h(For, {
          each: () => rows(20),
          by: (r: Row) => r.id,
          children: (r: Row) => h(RowItem, { id: r.id }),
        }),
      ),
      container,
    )
    expect(runs).toBe(20)
    unmount()
    tick.set(1)
    expect(runs).toBe(20)
  })

  it('a <For> that owns a LIVE parent still removes its rows when it leaves', () => {
    // Inside <Show>, the <For> is mounted through a reactive boundary (depth
    // 0), and the <ul> around it is part of the same branch — so flipping the
    // branch must leave the container empty.
    const open = signal(true)
    const container = document.createElement('div')
    mount(
      h(Show, {
        when: () => open(),
        children: h('ul', null, h(For, { each: () => rows(5), by: (r: Row) => r.id, children: (r: Row) => h('li', null, String(r.id)) })),
      }),
      container,
    )
    expect(container.querySelectorAll('li')).toHaveLength(5)
    open.set(false)
    expect(container.querySelectorAll('li')).toHaveLength(0)
    expect(container.querySelector('ul')).toBeNull()
  })

  it('a <For> at the top of a reactive boundary still removes rows on a list change', () => {
    const list = signal(rows(4))
    const container = document.createElement('div')
    mount(() => h(For, { each: () => list(), by: (r: Row) => r.id, children: (r: Row) => h('i', null, String(r.id)) }), container)
    list.set(rows(1))
    expect(container.querySelectorAll('i')).toHaveLength(1)
  })

  it('a <Portal> inside a row still clears its live target', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const container = document.createElement('div')
    const unmount = mount(
      h(
        'ul',
        null,
        h(For, {
          each: () => rows(3),
          by: (r: Row) => r.id,
          children: (r: Row) => h('li', null, h(Portal, { target }, h('p', null, `portal ${r.id}`))),
        }),
      ),
      container,
    )
    expect(target.querySelectorAll('p')).toHaveLength(3)
    unmount()
    expect(target.querySelectorAll('p')).toHaveLength(0)
    expect(target.childNodes.length).toBe(0)
  })
})
