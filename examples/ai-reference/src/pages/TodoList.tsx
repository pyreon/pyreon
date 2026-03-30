/**
 * List page with loader data, signals, and <For> rendering.
 *
 * PATTERNS:
 *   - useLoaderData() for route data
 *   - signal() for local state
 *   - <For> with "by" for keyed list
 *   - <Show> for conditional rendering
 *   - useHead() with reactive title
 *   - computed() for derived values
 */

import { For, Show } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import { computed, signal } from '@pyreon/reactivity'
import { useLoaderData } from '@pyreon/router'
import { TodoItem } from '../components/TodoItem'

interface Todo {
  id: number
  title: string
  completed: boolean
}

export const TodoList = () => {
  const todos = useLoaderData<Todo[]>()
  const filter = signal<'all' | 'active' | 'done'>('all')

  const filtered = computed(() => {
    const f = filter()
    if (f === 'active') return todos.filter((t) => !t.completed)
    if (f === 'done') return todos.filter((t) => t.completed)
    return todos
  })

  const activeCount = computed(() => todos.filter((t) => !t.completed).length)

  useHead(() => ({
    title: `Todos (${activeCount()} active)`,
  }))

  return (
    <div>
      <h1>Todos</h1>

      <div>
        <button type="button" onClick={() => filter.set('all')}>
          All
        </button>
        <button type="button" onClick={() => filter.set('active')}>
          Active
        </button>
        <button type="button" onClick={() => filter.set('done')}>
          Done
        </button>
      </div>

      <Show when={() => filtered().length > 0} fallback={<p>No todos match filter.</p>}>
        <ul>
          <For
            each={() => filtered()}
            by={(todo) => todo.id}
            children={(todo) => <TodoItem todo={todo} />}
          />
        </ul>
      </Show>

      <p>{activeCount()} items left</p>
    </div>
  )
}
