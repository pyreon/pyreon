import { Text, Press, Stack } from '@pyreon/primitives'
import { s } from '@pyreon/validate'
const shape = {}
const other = { string: () => 1 }
const foo = () => 1
export const G = s.object({ a: 5, b: s.object(shape), c: s.frob(), f: foo(), g: other.string() })
export function App(){ return <Text>x</Text> }
