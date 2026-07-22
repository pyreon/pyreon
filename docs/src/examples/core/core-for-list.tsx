import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * `<For each by>` is the keyed list primitive — it mounts one node per item
 * and reconciles by key, so adding or removing an item touches only that row.
 * Add/remove change the signal array and the tiles follow.
 */
export default function CoreForList() {
  const colors = ['#60a5fa', '#4ade80', '#f87171', '#fbbf24', '#a78bfa']
  let nextId = 3
  const items = signal([
    { id: 0, c: colors[0]! },
    { id: 1, c: colors[1]! },
    { id: 2, c: colors[2]! },
  ])

  const add = () => {
    const id = nextId++
    items.set([...items.peek(), { id, c: colors[id % colors.length]! }])
  }
  const remove = () => {
    const arr = items.peek()
    if (arr.length > 0) items.set(arr.slice(0, -1))
  }

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '16px', padding: '20px' } },
    h(
      'div',
      { class: 'row list', style: { gap: '8px', minHeight: '44px', alignItems: 'center' } },
      h(For, {
        each: () => items(),
        by: (it: { id: number }) => it.id,
        children: (it: { c: string }) =>
          h('div', { class: 'tile', style: { width: '38px', height: '38px', borderRadius: '9px', background: it.c } }),
      }),
    ),
    h(
      'div',
      { class: 'row', style: { gap: '8px' } },
      h('button', { onClick: add, style: { padding: '6px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: '#4ade80', color: '#052e16', fontSize: '13px', fontWeight: 600 } }, 'Add'),
      h('button', { onClick: remove, style: { padding: '6px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: '#cbd5e1', color: '#1e293b', fontSize: '13px', fontWeight: 600 } }, 'Remove'),
    ),
  )
}
