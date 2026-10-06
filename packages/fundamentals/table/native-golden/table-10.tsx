import { Stack, Text } from '@pyreon/primitives'
import { createTableState } from '@pyreon/table'
import { signal } from '@pyreon/reactivity'
export function App() {
  const rows = signal<{ id: number; nm: string }[]>([])
  const t = createTableState({ data: () => rows(), columns: [{ id: 'id' }, { id: 'nm' }] })
  return (<Stack><Text>{String(t.page())}</Text></Stack>)
}
