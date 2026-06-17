import { signal, computed, type Signal } from '@pyreon/reactivity'
import { For, Show } from '@pyreon/core'

// The complete app — everything from steps 1–5, plus delete + clear-completed.
//
// Notice there is no `useState`, no dependency array, no re-render. The
// component function runs ONCE; every reactive piece is a signal read inside a
// thunk. Adding, toggling, filtering, and deleting each touch only the exact
// DOM that changed.

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

export default function TodoApp() {
  const todos = signal<Todo[]>([
    makeTodo('Learn signals', true),
    makeTodo('Build a real app'),
  ])
  const draft = signal('')
  const filter = signal<Filter>('all')

  const visible = computed(() => {
    const f = filter()
    return todos().filter((t) =>
      f === 'all' ? true : f === 'active' ? !t.done() : t.done(),
    )
  })
  const remaining = computed(() => todos().filter((t) => !t.done()).length)
  const hasCompleted = computed(() => todos().some((t) => t.done()))

  function add() {
    const text = draft().trim()
    if (text === '') return
    todos.update((list) => [...list, makeTodo(text)])
    draft.set('')
  }
  function remove(id: number) {
    todos.update((list) => list.filter((t) => t.id !== id))
  }
  function clearCompleted() {
    todos.update((list) => list.filter((t) => !t.done()))
  }

  return (
    <div class="example-col">
      <form
        class="example-row"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          class="example-input"
          placeholder="Add a todo…"
          value={() => draft()}
          onInput={(e) => draft.set(e.currentTarget.value)}
        />
        <button type="submit" class="example-btn">
          Add
        </button>
      </form>

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
                  flex: '1',
                  textDecoration: todo.done() ? 'line-through' : 'none',
                  opacity: todo.done() ? '0.55' : '1',
                })}
              >
                {todo.text}
              </span>
              <button
                type="button"
                class="example-btn"
                aria-label="Delete"
                onClick={() => remove(todo.id)}
              >
                ✕
              </button>
            </li>
          )}
        </For>
      </ul>

      <div class="example-row" style={{ justifyContent: 'space-between' }}>
        <span class="example-muted">
          {() => String(remaining())} left
        </span>
        <Show when={hasCompleted}>
          <button type="button" class="example-btn" onClick={clearCompleted}>
            Clear completed
          </button>
        </Show>
      </div>
    </div>
  )
}
