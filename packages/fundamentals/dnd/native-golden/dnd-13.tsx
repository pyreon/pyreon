import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
export function App(){
  const items = signal([{ id: 'a' }])
  const s = useSortable({ items: () => items(), by: (it) => it.id, onReorder: handler })
  return <Text>x</Text>
}
