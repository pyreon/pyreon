import { signal } from '@pyreon/reactivity'
import { rx } from '@pyreon/rx'
export function App(){
  const nums = signal([1, 2, 3])
  const other = { filter: (a: number[]) => a }
  const r = other.filter(nums)
  return <Text>{String(r())}</Text>
}
