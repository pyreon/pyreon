import { signal } from '@pyreon/reactivity'
import { rx } from '@pyreon/rx'
export function App(){
  const nums = signal([1, 2, 3])
  const r = (fnA || fnB)(nums)
  return <Text>{String(r())}</Text>
}
