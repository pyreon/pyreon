import { unique } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function App() {
  const nums = signal<number[]>([3, 1, 2, 3, 4])
  const u = unique(nums)
  return <Text>{u().length}</Text>
}
