import { s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
export function W() {
  const a = s.string().safeParse('x')
  const b = s.object(shapeVar).safeParse({ n: 1 })
  const c = s.object({}).safeParse({})
  const d = other.object({ n: s.number() }).safeParse({})
  const e = s.array(s.string()).safeParse([])
  return (<Stack><Text>hi</Text></Stack>)
}
