import { Stack, Text } from '@pyreon/primitives'
import { createTableState } from '@pyreon/table'
import { signal } from '@pyreon/reactivity'
type Row = { id: number; name: string }
export function App() {
  const rows = signal<Row[]>([])
  const t1 = createTableState({ data: () => rows(), columns: [{ id: 'id' }, { id: 'name' }], pageSize: 10 })
  const t2 = createTableState({ data: () => rows(), columns: [{ id: 'id' }] })
  return (<Stack><Text>{() => `${t1.page()}${t2.page()}`}</Text></Stack>)
}
