import { s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
export const Sch = s.object({ a: s.string().regex(/^ab$/i) })
export function S() { return (<Stack><Text>hi</Text></Stack>) }
