import { signal, computed, type Signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'

// Step 5 — filter the view.
//
// `visible` is a `computed` that reads TWO signals — the `filter` and the
// `todos` (plus each `done`). `<For each={visible}>` renders the derived list,
// so changing the filter or toggling a todo re-derives exactly what's shown.

type Filter = 'all' | 'active' | 'completed'

interface Todo {
  id: number
  text: string
  done: Signal<boolean>
}

let nextId = 1
function makeTodo(text: string, done = false): Todo {
  return { id: nextId++, text, done: signal(done) }
}

export default function TodoFilter() {
  const todos = signal<Todo[]>([
    makeTodo('Learn signals', true),
    makeTodo('Add a filter'),
    makeTodo('Switch the tabs', true),
  ])
  const filter = signal<Filter>('all')

  const visible = computed(() => {
    const f = filter()
    return todos().filter((t) =>
      f === 'all' ? true : f === 'active' ? !t.done() : t.done(),
    )
  })

  // The tabs are three buttons. Each reads `filter()` in a thunk, so only the
  // active one restyles when the filter changes. (Tip: a local helper that
  // *returns* JSX — `const tab = (f) => <button…>` — won't render when called
  // inline as `{tab('all')}` under a DOM element; write the elements out, or
  // extract a real `<Tab/>` component.)
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          class="example-btn"
          style={() => ({
            fontWeight: filter() === 'all' ? '700' : '400',
            opacity: filter() === 'all' ? '1' : '0.6',
          })}
          onClick={() => filter.set('all')}
        >
          all
        </button>
        <button
          type="button"
          class="example-btn"
          style={() => ({
            fontWeight: filter() === 'active' ? '700' : '400',
            opacity: filter() === 'active' ? '1' : '0.6',
          })}
          onClick={() => filter.set('active')}
        >
          active
        </button>
        <button
          type="button"
          class="example-btn"
          style={() => ({
            fontWeight: filter() === 'completed' ? '700' : '400',
            opacity: filter() === 'completed' ? '1' : '0.6',
          })}
          onClick={() => filter.set('completed')}
        >
          completed
        </button>
      </div>
      <ul class="example-col example-list">
        <For each={visible} by={(t) => t.id}>
          {(todo) => (
            <li class="example-row example-card">
              <input
                type="checkbox"
                checked={() => todo.done()}
                onChange={() => todo.done.update((v) => !v)}
              />
              <span
                style={() => ({
                  textDecoration: todo.done() ? 'line-through' : 'none',
                  opacity: todo.done() ? '0.55' : '1',
                })}
              >
                {todo.text}
              </span>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}
