import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
type Row = { id: number; title: string }
export function App() {
  const rows = signal<Row[]>([])
  const s = useSortable({ items: () => rows(), by: (t) => t.id, onReorder: (n) => rows.set(n) })
  return (<Stack ref={s.containerRef}>
    <For each={rows()} by={(t) => t.id}>
      {(item) => <Text ref={s.itemRef(item.id)}>x</Text>}
    </For>
  </Stack>)
}
