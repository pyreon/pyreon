import { groupBy } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function App() {
  const nums = signal<number[]>([1])
  const out = groupBy(nums, (n) => n)
  return <Text>{out().length}</Text>
}
