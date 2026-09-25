import { signal, computed } from '@pyreon/reactivity'
import { For, h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Todo store — list + derived count.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
interface Todo {
  id: number
  text: string
  done: boolean
}

export default function TodoStoreListDerivedCount() {
  const todos = signal<Todo[]>([
    { id: 1, text: 'Learn Pyreon', done: true },
    { id: 2, text: 'Build an app', done: false },
  ])
  const draft = signal('')
  let nextId = 3

  const remaining = computed(() => todos().filter(t => !t.done).length)

  const add = () => {
    const text = draft().trim()
    if (!text) return
    todos.update(t => [...t, { id: nextId++, text, done: false }])
    draft.set('')
  }
  const toggle = (id: number) => todos.update(all =>
    all.map(t => t.id === id ? { ...t, done: !t.done } : t)
  )
  const remove = (id: number) => todos.update(all => all.filter(t => t.id !== id))
  // <For> keys by `t.id`, so a toggle/remove patches only the affected
  // row instead of rebuilding the whole list — but the `t` the children
  // callback closes over is a snapshot from the row's FIRST mount (an
  // immutable update replaces the object; the key match means <For>
  // does NOT re-invoke the callback). Look the row up live by id for
  // anything that must track `done`.
  const liveTodo = (id: number) => todos().find(t => t.id === id)

  return h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('input', {
        placeholder: 'What needs doing?',
        style: { flex: 1, minWidth: '0' },
        onInput: (e: any) => draft.set(e.target.value),
        onKeydown: (e: any) => { if (e.key === 'Enter') add() },
      }),
      h('button', { onClick: add }, 'Add'),
    ),
    h('div', { class: 'card' }, () =>
      todos().length === 0
        ? h('div', { class: 'muted' }, 'No todos yet.')
        : h('div', { class: 'col' },
            h(For, {
              each: () => todos(),
              by: (t: Todo) => t.id,
              children: (t: Todo) =>
                h('div', { class: 'row', style: { justifyContent: 'space-between' } },
                  h('label', { class: 'row', style: { gap: '8px', cursor: 'pointer' } },
                    h('input', { type: 'checkbox', checked: () => liveTodo(t.id)?.done ?? false, onChange: () => toggle(t.id) }),
                    h('span', {
                      style: () => ({
                        textDecoration: liveTodo(t.id)?.done ? 'line-through' : 'none',
                        opacity: liveTodo(t.id)?.done ? 0.6 : 1,
                      }),
                    }, t.text),
                  ),
                  h('button', {
                    onClick: () => remove(t.id),
                    style: { padding: '2px 8px', fontSize: '12px' },
                  }, '✕'),
                ),
            }),
          ),
    ),
    h('div', { class: 'muted' }, () => remaining() + ' remaining'),
  )
}
