import { defineFeature } from '@pyreon/feature'
import { Stack, Text } from '@pyreon/primitives'

// A feature binding that shares its name with a type the file declares: Swift and Kotlin share one namespace for the two,
// so the value is renamed, and so is everything that follows it.
type Todo = { id: string; title: string }
type Tag = 'a' | 'b'
export const Todo = defineFeature({ name: 'todo', schema: { id: 'string', title: 'string' } })
export const Tag = defineFeature({ name: 'tag', schema: { label: 'string' } })

export function App(props: { todo: Todo; tag: Tag }) {
  return <Stack><Text>{props.todo.title}</Text><Text>{Todo.name}</Text></Stack>
}
