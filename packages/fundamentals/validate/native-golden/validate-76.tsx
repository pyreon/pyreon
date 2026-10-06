import { s } from '@pyreon/validate'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
const Pet = s.object({ name: s.string() })
type Tag = { label: string }
export function V() {
  const maybe = signal<Tag | null>(null)
  const names = signal<Tag[] | undefined>(undefined)
  const a = Pet.safeParse({ name: 'a', t: maybe(), ns: names() })
  return (<Stack><Text>hi</Text></Stack>)
}
