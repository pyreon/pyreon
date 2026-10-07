import { Stack, Text } from '@pyreon/primitives'
import { createTableState } from '@pyreon/table'
import { useSortable } from '@pyreon/dnd'
import { signal } from '@pyreon/reactivity'
export function App() {
  const notArr = signal<number>(1)
  const t = createTableState({ data: () => notArr(), columns: [{ id: 'id' }] })
  const s = useSortable({ items: () => notArr(), by: (r) => r, onReorder: (next) => notArr.set(1) })
  return (<Stack><Text>{() => `${t.page()}${s.items().length}`}</Text></Stack>)
}
