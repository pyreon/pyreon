import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number; title: string }
export function App() {
  const todos = signal<Todo[]>([{ id: 1, title: 'a' }, { id: 2, title: 'b' }])
  const s = useSortable({
    items: () => todos(),
    by: (t) => t.id,
    onReorder: (next) => todos.set(next),
    axis: 'horizontal',
  })
  return (<Stack ref={s.containerRef}>
    <For each={todos()} by={(t) => t.id}>
      {(t) => <Text ref={s.itemRef(t.id)}>{t.title}</Text>}
    </For>
  </Stack>)
}
