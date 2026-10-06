import { Text, Press, Stack } from '@pyreon/primitives'
import { s } from '@pyreon/validate'
export const A = s.object({ a: s.string().url({ [`protocol`]: 1 }), b: s.string().url({ [`protocol`]: /^https$/ }) })
export function App(){ return <Text>x</Text> }
