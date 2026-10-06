import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const items = signal<string[]>(['a'])
  const s = useSortable({ items: () => items(), by: (w) => w, onReorder: () => {} })
  return (<Stack><Text>{items().length}</Text></Stack>)
}
