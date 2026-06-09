import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Sortable Table.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function SortableTable() {
  const data = signal([
    { name: 'Alice', age: 30, role: 'Engineer' },
    { name: 'Bob', age: 25, role: 'Designer' },
    { name: 'Charlie', age: 35, role: 'Manager' },
    { name: 'Diana', age: 28, role: 'Engineer' },
  ])
  const sortKey = signal('name')
  const sortDir = signal(1)

  const sorted = computed(() =>
    [...data()].sort((a, b) => {
      const va = (a as Record<string, any>)[sortKey()], vb = (b as Record<string, any>)[sortKey()]
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir()
    })
  )

  const header = (key: any, label: any) => h('th', {
    onClick: () => { if (sortKey() === key) sortDir.update(d => d * -1); else { sortKey.set(key); sortDir.set(1) } },
    style: { cursor: 'pointer', padding: '6px 12px', textAlign: 'left', borderBottom: '2px solid #ddd' },
  }, () => label + (sortKey() === key ? (sortDir() === 1 ? ' ▲' : ' ▼') : ''))

  return h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' } },
    h('thead', {}, h('tr', {}, header('name', 'Name'), header('age', 'Age'), header('role', 'Role'))),
    h('tbody', {}, () => sorted().map(r =>
      h('tr', {}, ...[r.name, r.age, r.role].map(v => h('td', { style: { padding: '6px 12px', borderBottom: '1px solid #eee' } }, String(v))))
    )),
  )
}
