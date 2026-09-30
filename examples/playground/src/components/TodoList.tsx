import { For } from '@pyreon/core'
import { state, derived, signalOf } from '@pyreon/core/plain'
import { untrack } from '@pyreon/reactivity'

interface Todo {
  id: number
  text: string
  done: boolean
}

export function TodoList() {
  let todos = state.raw<Todo[]>([
    { id: 1, text: 'Build Pyreon framework', done: true },
    { id: 2, text: 'Write tests', done: true },
    { id: 3, text: 'Build the playground', done: false },
  ])
  let input = state('')

  const remaining = derived(() => todos.filter((t) => !t.done).length)

  const addTodo = () => {
    const text = input.trim()
    if (!text) return
    todos = [...todos, { id: Date.now(), text, done: false }]
    input = ''
  }

  const toggle = (id: number) => {
    todos = ((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))(untrack(() => todos))
  }

  const remove = (id: number) => {
    todos = ((list) => list.filter((t) => t.id !== id))(untrack(() => todos))
  }

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') addTodo()
  }

  return (
    <div class="card">
      <h2>Todo List</h2>
      <p class="remaining">{() => remaining} remaining</p>

      <div class="input-row">
        <input
          type="text"
          placeholder="Add a todo…"
          value={() => input}
          onInput={(e) => { input = e.currentTarget.value }}
          onKeyDown={handleKey}
        />
        <button type="button" onClick={addTodo}>
          Add
        </button>
      </div>

      <ul class="todo-list">
        <For each={signalOf<typeof todos>(todos)} by={(todo) => todo.id}>
          {(todo) => (
            <li class={todo.done ? 'done' : ''}>
              <input type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)} />
              <span>{todo.text}</span>
              <button type="button" class="remove" onClick={() => remove(todo.id)}>
                ×
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}
