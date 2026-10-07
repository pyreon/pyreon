import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
export function App(){
  const items = signal([{ id: 'a' }])
  const s = useSortable({ items: () => items(), by: (it) => { return it.id }, onReorder: (n) => items.set(n) })
  return <Text>x</Text>
}
