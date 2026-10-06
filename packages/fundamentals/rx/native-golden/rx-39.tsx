import { filter, map, take, unique } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function App() {
  const nums = signal<number[]>([1, 2, 3, 4])
  const evens = filter(nums, (n) => n % 2 === 0)
  const doubled = map(nums, (n) => n * 2)
  const first2 = take(nums, 2)
  const uniq = unique(nums)
  return <Text>{evens().length + doubled().length + first2().length + uniq().length}</Text>
}
