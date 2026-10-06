import { s } from '@pyreon/validate'
import { Text } from '@pyreon/primitives'
const k = 'protocol'
const L = s.object({ web: s.string().url({ [k]: /^https$/ }) })
export function App() { return <Text>x</Text> }
