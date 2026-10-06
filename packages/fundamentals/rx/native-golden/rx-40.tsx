import { map as project } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function App() {
  const nums = signal<number[]>([1])
  const out = project(nums, (n) => n * 2)
  return <Text>{out().length}</Text>
}
