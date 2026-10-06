import { signal } from '@pyreon/reactivity'
import { useDatabase } from '@pyreon/hooks'
import { Stack, Text, Button, Show } from '@pyreon/primitives'

// Every method, every insert shape, and the optional record `get` returns.
export function Notes() {
  const db = useDatabase()
  const draft = signal('x')
  const extra = { owner: 'me' }
  const found = db.get('notes', 'n1')
  return (
    <Stack>
      <Button onPress={() => db.insert('notes', { id: 'n1', fields: { title: draft(), body: 'b' } })}>add</Button>
      <Button onPress={() => db.insert('notes', { id: 'n2' })}>add bare</Button>
      <Button onPress={() => db.insert('notes', { id: 'n3', fields: extra })}>add var</Button>
      <Button onPress={() => db.insert('notes', { id: 'n4', fields: {} })}>add empty</Button>
      <Button onPress={() => db.insert('notes', { title: 'no id' })}>bad</Button>
      <Button onPress={() => db.insert('notes', { id: 'n5', extra: 1, fields: { a: 'b' } })}>bad extra</Button>
      <Button onPress={() => db.insert('notes')}>wrong arity</Button>
      <Button onPress={() => db.delete('notes', 'n1')}>del</Button>
      <Text>{String(db.all('notes').length)}</Text>
      <Text>{String(db.count('notes'))}</Text>
      <Text>{String(db.find('notes', 'title', 'x').length)}</Text>
      <Show when={db.get('notes', 'n1')}><Text>has</Text></Show>
      <Text>{found ? 'found' : 'missing'}</Text>
      <Button onPress={() => db.get('notes', 'a', 'b')}>too many</Button>
      <Button onPress={() => db.delete('notes')}>too few</Button>
    </Stack>
  )
}
