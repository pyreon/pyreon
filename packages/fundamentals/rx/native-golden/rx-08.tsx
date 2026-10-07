import { signal } from '@pyreon/reactivity'
import { rx, map } from '@pyreon/rx'
import * as all from '@pyreon/rx'
export function App(){
  const nums = signal([1, 2, 3])
  const r = map(nums, (x) => x * 2)
  return <Text>{String(r())}</Text>
}
