import { model } from '@pyreon/state-tree'
import { defineFeature } from '@pyreon/feature'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { Stack, Text } from '@pyreon/primitives'

// A model, a feature and a schema in one file: the models emit first, then the features, then the schemas.
const Pet = zodSchema(z.object({ name: z.string() }))
export const Todo = defineFeature({ name: 'todo', schema: { id: 'string' } })
const counter = model({ state: { n: 0 } }).create()

export function App() {
  return <Stack><Text>{String(counter.n)}</Text><Text>{Todo.name + String(Pet)}</Text></Stack>
}
