import { s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
export const Book = s.object({ title: s.string() })
export type Book = { title: string }
export function L() {
  const rows = [1, 2]
  return (<Stack>{rows.map((Book) => <Text>{String(Book)}</Text>)}</Stack>)
}
