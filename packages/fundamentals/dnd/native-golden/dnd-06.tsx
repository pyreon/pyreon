import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
export function App(){
  const items = signal([{ id: 'a' }])
  const s = useSortable({ items: () => items(), by: (it) => it.id, onReorder: (next) => items.set(next), groupId: 'g', onCrossListDrop: () => {}, onCrossListReceive: () => {}, label: 'x' })
  return <Text>x</Text>
}
