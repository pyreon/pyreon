import { signal, computed, type Signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'

// Step 4 — derived counts.
//
// `computed` derives a value from other signals and caches it. It reads
// `todos()` AND each `todo.done()`, so it recomputes when a todo is added OR
// toggled — and only then. Read it like any signal: `remaining()`.

interface Todo {
  id: number
  text: string
  done: Signal<boolean>
}

let nextId = 1
function makeTodo(text: string, done = false): Todo {
  return { id: nextId++, text, done: signal(done) }
}

export default function TodoCounts() {
  const todos = signal<Todo[]>([
    makeTodo('Learn signals', true),
    makeTodo('Add a computed'),
    makeTodo('Watch the count update'),
  ])

  const remaining = computed(() => todos().filter((t) => !t.done()).length)
  const total = computed(() => todos().length)

  return (
    <div class="example-col">
      <div class="example-card">
        <strong>{() => String(remaining())}</strong> of{' '}
        <strong>{() => String(total())}</strong> remaining
      </div>
      <ul class="example-col example-list">
        <For each={todos} by={(t) => t.id}>
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
