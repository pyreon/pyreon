import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'

// Step 1 — render a list.
//
// A signal is reactive state. Read it by calling it (`todos()`). `<For>` is
// the keyed list renderer — `each` takes the signal, `by` gives each row a
// stable key so the framework reconciles instead of re-creating rows.

interface Todo {
  id: number
  text: string
}

export default function TodoList() {
  const todos = signal<Todo[]>([
    { id: 1, text: 'Learn signals' },
    { id: 2, text: 'Render a list' },
    { id: 3, text: 'Ship something' },
  ])

  return (
    <ul class="example-col example-list">
      <For each={todos} by={(t) => t.id}>
        {(todo) => <li class="example-card">{todo.text}</li>}
      </For>
    </ul>
  )
}
