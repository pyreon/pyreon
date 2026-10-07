import { Stack, Text } from '@pyreon/primitives'
import { rx } from '@pyreon/rx'
function App() {
  const items = signal<number[]>([1, 2, 3])
  const r = rx.intersperse(items, 0)
  return (<Stack><Text>x</Text></Stack>)
}
