import { s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
const Pet = s.object({ name: s.string(), age: s.number() })
const Shape = s.discriminatedUnion('kind', [s.object({ kind: s.literal('a'), x: s.number() }), s.object({ kind: s.literal('b'), y: s.string() })])
export function A() {
  const r = Pet.parse({ name: 'a', age: 1 })
  const u = Shape.safeParse({ kind: 'a', x: 1 })
  const v = Pet.parseAsync({ name: 'a', age: 1 })
  return (<Stack><Text>hi</Text></Stack>)
}
