
import { signal } from '@pyreon/reactivity'
import { createTableState } from '@pyreon/table'
import { Stack, Text, Button, For } from '@pyreon/primitives'
export function UsersTable() {
  const users = signal([{ id: 1, name: 'Ada', age: 36 }, { id: 2, name: 'Linus', age: 54 }])
  const t = createTableState({ data: () => users(), columns: [{ id: 'name' }, { id: 'age' }], pageSize: 10 })
  return (
    <Stack>
      <Button onPress={() => t.toggleSort('name')}>Sort</Button>
      <Text>{t.filteredCount()}</Text>
      <Text>{t.page()}</Text>
      <For each={t.rows()}>{(u) => <Text>{u.name}</Text>}</For>
    </Stack>
  )
}
