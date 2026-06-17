import { signal, type Signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'

// Step 3 — toggle completion.
//
// Each todo's `done` is its OWN signal. That's the fine-grained pattern: a
// keyed `<For>` row runs ONCE, and `checked={() => todo.done()}` /
// `style={() => ...}` are reactive thunks, so toggling one todo updates only
// that row's checkbox + strike-through — no list re-render, no row re-mount.

interface Todo {
  id: number
  text: string
  done: Signal<boolean>
}

let nextId = 1
function makeTodo(text: string, done = false): Todo {
  return { id: nextId++, text, done: signal(done) }
}

export default function TodoToggle() {
  const todos = signal<Todo[]>([
    makeTodo('Learn signals', true),
    makeTodo('Toggle this one'),
    makeTodo('And this one'),
  ])

  return (
    <ul class="example-col example-list">
      <For each={todos} by={(t) => t.id}>
        {(todo) => (
          <li class="example-row example-card">
            <input
              type="checkbox"
              checked={todo.done()}
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
  )
}
