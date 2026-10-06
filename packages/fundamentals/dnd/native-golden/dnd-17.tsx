import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
type Row = { id: number; title: string }
export function App() {
  const rows = signal<string[]>([])
  const s = useSortable({ items: () => rows(), by: (i) => i, onReorder: (n) => rows.set(n) })
  return (<Stack ref={s.containerRef}>
    <For each={rows()} by={(i) => i}>
      {(item) => <Text ref={s.itemRef(item)}>x</Text>}
    </For>
  </Stack>)
}
