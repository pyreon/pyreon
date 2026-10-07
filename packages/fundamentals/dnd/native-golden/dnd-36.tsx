import { Stack, Text } from '@pyreon/primitives'
import { useSortable } from '@pyreon/dnd'
import { signal } from '@pyreon/reactivity'
type Row = { id: number; name: string }
export function App() {
  const rows = signal<Row[]>([])
  const s1 = useSortable({ items: () => rows(), by: (r) => r.id, onReorder: (next) => rows.set(next), axis: 'horizontal' })
  const s2 = useSortable({ items: () => rows(), by: (r) => r.id, onReorder: (next) => rows.set(next) })
  return (<Stack><Text>{() => `${s1.items().length}${s2.items().length}`}</Text></Stack>)
}
