/**
 * List item component with props and event handling.
 *
 * PATTERNS:
 *   - Props interface for component typing
 *   - RouterLink for navigation
 *   - Signal for local toggle state
 *   - Event handler as plain function
 */
import { state } from '@pyreon/core/plain'
import { RouterLink } from '@pyreon/router'

interface Todo {
  id: number
  title: string
  completed: boolean
}

export const TodoItem = (props: { todo: Todo }) => {
  let checked = state(props.todo.completed)

  const toggle = () => {
    checked = !checked
    // In a real app: persist to server
  }

  return (
    <li class={checked ? 'completed' : ''}>
      <input type="checkbox" checked={checked} onInput={toggle} />
      <RouterLink to={`/todo/${props.todo.id}`}>{props.todo.title}</RouterLink>
    </li>
  )
}
