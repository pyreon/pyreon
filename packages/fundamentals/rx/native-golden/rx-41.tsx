import { pipe } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function App() {
  const nums = signal<number[]>([1])
  const out = pipe(nums, (xs) => xs.filter((n) => n > 1))
  return <Text>{out().length}</Text>
}
