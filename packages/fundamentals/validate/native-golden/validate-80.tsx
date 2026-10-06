import { s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
export const Pet = s.object({ name: s.string(), tags: s.array(s.string()) })
export type Pet = { name: string }
export function V() {
  const ok = Pet.safeParse({ name: 'a', tags: [] }).success
  return (<Stack><Text>{String(ok)}</Text></Stack>)
}
