import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

// <For>'s update path skipped its stale-row scan when nothing was added and the
// cache held `n` entries — a "pure reorder". A duplicated key satisfies that
// count while another key is gone, so the removed row stayed in the DOM.
describe('<For> — a duplicated key never hides a removed row', () => {
  type R = { id: number; t: string }
  const setup = (initial: R[]) => {
    const c = document.createElement('div')
    const items = signal<R[]>(initial)
    const un = mount(
      h('ul', null, h(For as never, { each: items, by: (r: R) => r.id, children: (r: R) => h('li', null, r.t) })),
      c,
    )
    return { c, items, un, text: () => Array.from(c.querySelectorAll('li')).map((l) => l.textContent) }
  }

  it('removes the dropped key when another key is duplicated (n unchanged)', () => {
    const { items, text, un } = setup([{ id: 1, t: 'a' }, { id: 2, t: 'b' }, { id: 3, t: 'c' }])
    items.set([{ id: 2, t: 'b' }, { id: 2, t: 'b2' }, { id: 1, t: 'a' }])
    expect(text()).not.toContain('c')
    expect(text()).toEqual(['b', 'a'])
    un()
  })

  it('a valid pure reorder still keeps every row (the fast path stays correct)', () => {
    const { items, text, un } = setup([{ id: 1, t: 'a' }, { id: 2, t: 'b' }, { id: 3, t: 'c' }])
    items.set([{ id: 3, t: 'c' }, { id: 1, t: 'a' }, { id: 2, t: 'b' }])
    expect(text()).toEqual(['c', 'a', 'b'])
    items.set([{ id: 2, t: 'b' }, { id: 3, t: 'c' }, { id: 1, t: 'a' }])
    expect(text()).toEqual(['b', 'c', 'a'])
    un()
  })
})
