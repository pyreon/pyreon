import { Text, Press, Stack } from '@pyreon/primitives'
import { s } from '@pyreon/validate'
export const U = s.discriminatedUnion('k', [s.object({ k: s.literal('a'), inner: s.object({ q: s.string() }) })])
export function App(){ return <Text>x</Text> }
