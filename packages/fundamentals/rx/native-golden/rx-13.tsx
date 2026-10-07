import { signal } from '@pyreon/reactivity'
import { reduce, filter } from '@pyreon/rx'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const xs = signal([1, 2, 3])
  const total = reduce(xs, (a: number, b: number) => a + b)
  const evens = filter(xs)
  return (<Stack><Text>{total()}</Text><Text>{evens().length}</Text></Stack>)
}
