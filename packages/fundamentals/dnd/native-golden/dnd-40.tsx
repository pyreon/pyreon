import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text, For } from '@pyreon/primitives'
type Row = { id: number; name: string }
export function App() {
  const items = signal<Row[]>([{ id: 1, name: 'a' }])
  const s = useSortable({ [k]: 1, items: () => items(), by: (r) => r.id, onReorder: (x) => items.set(x), axis: 'horizontal' })
  return (<Stack ref={s.containerRef}><For each={items()} by={(r) => r.id}>{(r) => <Text ref={s.itemRef(r.id)}>{r.name}</Text>}</For><Text ref={s.other}>x</Text><Text ref={s.itemRef(1, 2)}>y</Text></Stack>)
}
