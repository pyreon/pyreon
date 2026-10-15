/**
 * An `effect()` / `computed()` created directly in a `<For>` row callback is
 * owned by that row: it stops when the row is removed and when the list
 * unmounts. Before, it registered with whatever scope was current — none,
 * after the surrounding component's setup — so a removed row kept running its
 * effects forever.
 */
import { describe, expect, it } from 'vitest'
import { For, h } from '@pyreon/core'
import { computed, effect, signal } from '@pyreon/reactivity'
import { mount } from '../index'

describe('<For> row callbacks own their effects', () => {
  it('a removed row stops running its effect', () => {
    const tick = signal(0)
    const list = signal([1, 2, 3])
    let runs = 0
    const App = () =>
      h(
        'ul',
        null,
        h(For, {
          each: () => list(),
          by: (x: number) => x,
          children: (x: number) => {
            effect(() => {
              tick()
              runs++
            })
            return h('li', null, String(x))
          },
        }),
      )
    mount(h(App, null), document.createElement('div'))
    list.set([1])
    runs = 0
    tick.set(1)
    expect(runs).toBe(1)
  })

  it('rows added by a later update are owned too, and the list unmount stops them all', () => {
    const tick = signal(0)
    const list = signal([1])
    let runs = 0
    const dispose = mount(
      h(
        'ul',
        null,
        h(For, {
          each: () => list(),
          by: (x: number) => x,
          children: (x: number) => {
            effect(() => {
              tick()
              runs++
            })
            return h('li', null, String(x))
          },
        }),
      ),
      document.createElement('div'),
    )
    list.set([1, 2, 3])
    runs = 0
    tick.set(1)
    expect(runs).toBe(3)
    dispose()
    runs = 0
    tick.set(2)
    expect(runs).toBe(0)
  })

  it('a computed created in a row stops with the row', () => {
    const base = signal(1)
    const list = signal([1, 2])
    let evals = 0
    const container = document.createElement('div')
    mount(
      h(
        'ul',
        null,
        h(For, {
          each: () => list(),
          by: (x: number) => x,
          children: (x: number) => {
            const doubled = computed(() => {
              evals++
              return base() * 2 + x
            })
            return h('li', null, () => String(doubled()))
          },
        }),
      ),
      container,
    )
    expect(container.textContent).toBe('34')
    list.set([1])
    evals = 0
    base.set(5)
    expect(container.textContent).toBe('11')
    expect(evals).toBe(1)
  })

  it('a row callback that throws does not hand a half-filled scope to the next row', () => {
    const tick = signal(0)
    let runs = 0
    const list = signal<number[]>([])
    mount(
      h(
        'ul',
        null,
        h(For, {
          each: () => list(),
          by: (x: number) => x,
          children: (x: number) => {
            effect(() => {
              tick()
              runs++
            })
            if (x === 2) throw new Error('row 2 fails')
            return h('li', null, String(x))
          },
        }),
      ),
      document.createElement('div'),
    )
    try {
      list.set([2])
    } catch {
      // the failing row's own error
    }
    list.set([1])
    runs = 0
    tick.set(1)
    // Only row 1's effect is alive: row 2's was stopped with its collector.
    expect(runs).toBe(1)
  })
})
