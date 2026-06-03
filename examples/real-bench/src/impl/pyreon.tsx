import { For } from '@pyreon/core'
import { batch, signal, type Signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import type { Filter, Todo, TodoApp } from '../types'

/**
 * Idiomatic Pyreon: fine-grained signals. Each row owns a `done` signal, so
 * `toggleAll` flips 100 signals and patches 100 checkboxes/classes IN PLACE —
 * no list reconciliation, the row VNodes never re-mount. `add` / `clearCompleted`
 * re-set the `rows` array signal (keyed `<For>` reconciles by id). This is the
 * real fine-grained shape a Pyreon user ships — NOT a forced whole-list render.
 */
interface RxTodo {
  id: number
  text: string
  done: Signal<boolean>
}

export function createPyreonApp(): TodoApp {
  const rows = signal<RxTodo[]>([])
  const filter = signal<Filter>('all')
  let nextId = 1
  let dispose: (() => void) | null = null

  const visible = (): RxTodo[] => {
    const f = filter()
    const all = rows()
    if (f === 'active') return all.filter((r) => !r.done())
    if (f === 'completed') return all.filter((r) => r.done())
    return all
  }

  return {
    name: 'Pyreon',
    mount(container) {
      dispose = mount(
        () => (
          <ul class="todos">
            <For each={visible} by={(r: RxTodo) => r.id}>
              {(r: RxTodo) => (
                <li class={() => (r.done() ? 'completed' : '')} data-id={r.id}>
                  <input type="checkbox" checked={() => r.done()} />
                  <span>{r.text}</span>
                </li>
              )}
            </For>
          </ul>
        ),
        container,
      )
    },
    seed(todos: Todo[]) {
      nextId = todos.reduce((m, t) => Math.max(m, t.id), 0) + 1
      rows.set(todos.map((t) => ({ id: t.id, text: t.text, done: signal(t.done) })))
    },
    addOne(text) {
      rows.set([...rows(), { id: nextId++, text, done: signal(false) }])
    },
    toggleAll(done) {
      // Fine-grained: flip each row's own signal — no array re-set, no <For> churn.
      batch(() => {
        for (const r of rows()) r.done.set(done)
      })
    },
    clearCompleted() {
      rows.set(rows().filter((r) => !r.done()))
    },
    setFilter(f) {
      filter.set(f)
    },
    commit() {
      // Pyreon signals flush synchronously inside the call above; a resolved
      // promise lets the harness await uniformly across frameworks.
      return Promise.resolve()
    },
    unmount() {
      dispose?.()
      dispose = null
    },
  }
}
