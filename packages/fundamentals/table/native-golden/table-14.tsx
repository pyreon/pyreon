import { createTableState } from '@pyreon/table'
import { Stack, Text, For } from '@pyreon/primitives'
type User = { name: string; age: number; vip: boolean }
export function App() {
  const users = signal<User[]>([{ name: 'a', age: 3, vip: true }])
  const t = createTableState({ data: () => users(), columns: [{ id: 'name' }, { id: 'age' }, { id: 'vip' }], pageSize: 10 })
  return (<Stack><Text>{t.page()}</Text><For each={t.rows()}>{(u) => <Text>{u.name}</Text>}</For></Stack>)
}
