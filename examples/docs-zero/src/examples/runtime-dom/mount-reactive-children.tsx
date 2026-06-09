import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — mount() + reactive children.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function MountReactiveChildren() {
  // mount() takes a VNode tree and inserts it into a host element.
  // The list child thunk re-evaluates when items() changes; the
  // runtime keys VDOM-style and reconciles with minimal DOM churn.
  const items = signal(['Apple', 'Banana', 'Cherry'])
  const draft = signal('')

  const add = () => {
    const v = draft().trim()
    if (!v) return
    items.update(i => [...i, v])
    draft.set('')
  }

  return h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('input', {
        placeholder: 'Add an item…',
        style: { flex: 1, minWidth: '0' },
        onInput: (e: any) => draft.set(e.target.value),
        onKeydown: (e: any) => { if (e.key === 'Enter') add() },
      }),
      h('button', { onClick: add }, 'Add'),
    ),
    h('div', { class: 'card' }, () =>
      items().length === 0
        ? h('div', { class: 'muted' }, 'Empty list — try adding an item.')
        : h('ul', { style: { margin: 0, paddingLeft: '20px' } },
            ...items().map(item => h('li', { style: { padding: '2px 0' } }, item)),
          ),
    ),
  )
}
