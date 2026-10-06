import { signal } from '@pyreon/reactivity'
import { rx } from '@pyreon/rx'
export function App(){
  const nums = signal([1, 2, 3])
  const r = rx.filter(nums, (x) => x > 1)
  return <Text>{String(r())}</Text>
}
