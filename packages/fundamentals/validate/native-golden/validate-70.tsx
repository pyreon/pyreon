import { s, withField } from '@pyreon/validate'
import { zodField, valibotField, arktypeField, zodSchema, valibotSchema } from '@pyreon/validation'
import { z } from 'zod'
import { Stack, Text } from '@pyreon/primitives'
const F1 = withField(base)
const F2 = withField(base, { label: 1 })
const F3 = withField(base, metaVar)
export function C() {
  const a = zodField(z.string())
  const b = valibotField(v.string())
  const c = arktypeField(type('string'))
  const d = withField(base, { label: 'x' })
  const e = zodSchema(z.object({ n: z.string() }))
  const f = valibotSchema(v.object({ n: v.string() }), safeParse)
  return (<Stack><Text>hi</Text></Stack>)
}
