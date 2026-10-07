import { withField, s } from '@pyreon/validate'
import { defineFeature } from '@pyreon/feature'
import { Stack, Text } from '@pyreon/primitives'
const Todo = defineFeature({ name: 'todo', schema: { id: 'string' } })
const emailField = withField(s.string(), { label: 'Email', placeholder: 'a@b.c' })
const Pet = s.object({ name: s.string() })
export function F() {
  return (<Stack><Text>hi</Text></Stack>)
}
