import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
type Row = { id: number; name: string }
export function App() {
  const items = signal<Row[]>([{ id: 1, name: 'a' }])
  const s = useSortable({ items: () => items(), by: (r) => r.id, onReorder: (x) => items.set(x) })
  return (<Stack><Text>x</Text></Stack>)
}
