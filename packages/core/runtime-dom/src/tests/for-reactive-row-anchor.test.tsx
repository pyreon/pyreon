/**
 * Regression lock — a `<For>` row that can REPLACE its own boundary nodes.
 *
 * `mountFor` records each row's DOM range as `[anchor..end]` and moves that
 * range on reorder. It used to take the anchor straight from the mounted
 * content (the row's first node). That is stable for an element row, but not
 * for a row whose first node a reactive boundary swaps on re-run:
 *
 *  - a row that IS an accessor: `(x) => () => <li>{x.label()}</li>`;
 *  - a component returning one — the documented reactive-conditional pattern
 *    `return (() => cond() ? <A/> : <B/>)`;
 *  - a polymorphic text row whose value becomes a VNode (replacing the text
 *    node, which may also be the row's LAST node).
 *
 * After such a row re-ran, its recorded anchor was the detached old node, and
 * the next reorder moved that dead node back into the list while the live
 * content stayed stranded at its old position — a duplicated, mis-ordered list
 * with no error. The fix delimits non-element rows with comments nothing
 * inside them can replace.
 *
 * Found by `hydrate-for-compact-fuzz.test.tsx` — the failing side was the
 * plain CLIENT mount, not hydration.
 */
import { For, h } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { mount } from '../index'

const text = (el: Element) => el.innerHTML.replace(/<!--[\s\S]*?-->/g, '')

interface Row {
  k: number
  l: Signal<string>
}
const rows = (): Row[] => [1, 2, 3].map((k) => ({ k, l: signal(`L${k}`) }))

const Conditional = (props: { row: Row }) =>
  (() => (props.row.l().startsWith('R') ? h('em', null, props.row.l()) : h('li', null, props.row.l()))) as never

const SHAPES: Array<[string, (r: Row) => unknown, (label: string) => string]> = [
  ['accessor row', (r) => () => h('li', null, r.l()), (l) => `<li>${l}</li>`],
  ['component returning an accessor', (r) => h(Conditional, { row: r }), (l) => (l.startsWith('R') ? `<em>${l}</em>` : `<li>${l}</li>`)],
  [
    'polymorphic text row upgraded to a subtree',
    (r) => () => (r.l().startsWith('R') ? h('b', null, r.l()) : r.l()),
    (l) => (l.startsWith('R') ? `<b>${l}</b>` : l),
  ],
]

describe('<For> rows that replace their own boundary nodes', () => {
  for (const [name, render, out] of SHAPES) {
    for (const op of ['reverse', 'rotate', 'remove first', 'insert front'] as const) {
      it(`${name} — re-run, then ${op}`, () => {
        const items = rows()
        const list = signal(items)
        const host = document.createElement('div')
        const dispose = mount(
          h('ul', null, h(For, { each: () => list(), by: (r: Row) => r.k, children: render } as never), h('i', null, 'tail')),
          host,
        )
        // Re-run the FIRST row, so its first (and, for text, only) node is replaced.
        items[0]!.l.set('R1')
        const next = [...list()]
        if (op === 'reverse') next.reverse()
        else if (op === 'rotate') next.push(next.shift() as Row)
        else if (op === 'remove first') next.shift()
        else next.unshift({ k: 9, l: signal('L9') })
        list.set(next)
        const expected = `<ul>${next.map((r) => out(r.l())).join('')}<i>tail</i></ul>`
        expect(text(host)).toBe(expected)
        // And it stays correct through a second move.
        list.set([...next].reverse())
        expect(text(host)).toBe(`<ul>${[...next].reverse().map((r) => out(r.l())).join('')}<i>tail</i></ul>`)
        dispose()
        expect(host.innerHTML).toBe('')
      })
    }
  }

  it('element rows keep the zero-overhead shape: no delimiter comments', () => {
    const host = document.createElement('div')
    mount(
      h('ul', null, h(For, { each: () => [1, 2], by: (n: number) => n, children: (n: number) => h('li', null, String(n)) } as never)),
      host,
    )
    // Only the block's own two markers — no per-row comment.
    expect(host.innerHTML.match(/<!--/g)?.length).toBe(2)
  })
})
