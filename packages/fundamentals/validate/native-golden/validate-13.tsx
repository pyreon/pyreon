import { Text, Press, Stack } from '@pyreon/primitives'
import { s } from '@pyreon/validate'
const o = { protocol: 1 }
export const A = s.object({ a: s.string().url(o), b: s.string().url({ 'protocol': /^https$/ }), c: s.string().url({}), d: s.string().url({ ...o }), e: s.array(s.string().url(o)) })
export function App(){ return <Text>x</Text> }
