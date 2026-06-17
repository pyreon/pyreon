import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'

// Step 2 — add items.
//
// A controlled input: `value` reads a signal, `onInput` writes it. The list is
// updated IMMUTABLY (`.update(list => [...list, item])`) — a new array tells
// the signal it changed, so `<For>` reconciles in the new item.

interface Todo {
  id: number
  text: string
}

export default function TodoAdd() {
  const todos = signal<Todo[]>([])
  const draft = signal('')
  let nextId = 1

  function add() {
    const text = draft().trim()
    if (text === '') return
    todos.update((list) => [...list, { id: nextId++, text }])
    draft.set('')
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
          placeholder="What needs doing?"
          value={draft()}
          onInput={(e) => draft.set(e.currentTarget.value)}
        />
        <button type="submit" class="example-btn">
          Add
        </button>
      </form>

      <ul class="example-col example-list">
        <For each={todos} by={(t) => t.id}>
          {(todo) => <li class="example-card">{todo.text}</li>}
        </For>
      </ul>
    </div>
  )
}
