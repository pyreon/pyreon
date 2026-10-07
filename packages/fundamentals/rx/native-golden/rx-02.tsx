import { signal } from '@pyreon/reactivity'
import { pipe } from '@pyreon/rx'
export function App(){
  const nums = signal([1, 2, 3])
  const r = pipe(nums, (xs) => xs)
  return <Text>{String(r())}</Text>
}
