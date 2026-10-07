import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
export function App(){
  const items = signal([{ id: 'a' }])
  const s = useSortable(cfg)
  return <Text>x</Text>
}
