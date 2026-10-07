
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

type Todo = { id: number; title: string; done: boolean; priority: number }

export function RxLowerProbe() {
  const todos = signal<Todo[]>([])
  const active = rx.filter(todos, (t: Todo) => !t.done)
  const priorities = rx.map(active, (t: Todo) => t.priority)
  const reversed = rx.reverse(active)
  return null
}
