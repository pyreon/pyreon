import { s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
export const Book = s.object({ title: s.string(), author: s.object({ name: s.string() }), tags: s.array(s.object({ t: s.string() })) })
export type Book = { title: string }
export const Pet = s.object({ name: s.string() })
export type Pet = { name: string }
export function R() {
  const Pet = 3
  return (<Stack><Text>hi</Text></Stack>)
}
