import { defineFeature } from '@pyreon/feature'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { Text } from '@pyreon/primitives'

// A feature declared AFTER a schema: the order the two lower in is part of the output.
const Pet = zodSchema(z.object({ name: z.string(), age: z.number() }))
export const Todo = defineFeature({ name: 'todo', schema: { id: 'string', done: 'boolean' } })
const Tag = defineFeature({ name: 'tag', schema: { label: 'string' } })

export function App() {
  return <Text>{Todo.name + Tag.name + String(Pet)}</Text>
}
