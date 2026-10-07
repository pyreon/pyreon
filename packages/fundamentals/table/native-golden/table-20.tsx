import { signal } from '@pyreon/reactivity'
import { createTableState } from '@pyreon/table'
import { Stack, Text, For } from '@pyreon/primitives'
export function App(){
  const rows = signal([{ id: 1, name: 'a', price: 2.5, ok: true }])
  const t = createTableState({ [k]: 1, data: () => rows(), pageSize: 5, columns: [{ id: 'name' }, { id: 'price' }, { id: 'ok' }, { id: 'id' }] })
  return <Stack><Text>{t.page()}{t.sortColumn()}{t.sortDirection()}{t.filterValue()}{t.pageCount()}</Text><For each={t.rows()} by={(r) => r.id}>{(r) => <Text>{r.name}</Text>}</For></Stack>
}
