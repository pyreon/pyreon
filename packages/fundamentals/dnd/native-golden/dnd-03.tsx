import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
export function App(){
  const items = signal([{ id: 'a' }])
  const s = useSortable({ items: () => items(), by: (it) => it.id, onReorder: (next) => items.set(next), axis: 'horizontal', 'label2': 1, ...more })
  return <Text>x</Text>
}
