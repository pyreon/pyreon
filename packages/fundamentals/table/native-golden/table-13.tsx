import { createTableState } from '@pyreon/table'
import { Stack, Text, For } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const rows = signal([{ name: 'a', age: 1 }])
  const t = createTableState({ data: () => rows(), columns: [{ id: 'name' }] })
  return (<Stack><For each={t.rows()}>{(u) => <Text>{u.name}</Text>}</For></Stack>)
}
