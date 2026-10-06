import { Text, Press, Stack } from '@pyreon/primitives'
import { s } from '@pyreon/validate'
const x = 1
export const U = s.discriminatedUnion('k', [s.object({ x: s.string() })])
export function App(){ return <Text>x</Text> }
