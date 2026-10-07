import { defineFeature } from '@pyreon/feature'
import { Stack, Text } from '@pyreon/primitives'

export const Todo = defineFeature({
  name: 'todo',
  schema: { id: 'string', title: 'string', done: 'boolean', priority: 'number' },
})

// The binding the source names is reachable, and a non-exported feature lowers the same.
const Note = defineFeature({ name: 'note', schema: { body: 'string' } })

export function App() {
  return <Stack><Text>{Todo.name}</Text><Text>{Note.name}</Text></Stack>
}
