import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack } from '@pyreon/primitives'
export function App() {
  const items = signal<string[]>(['a'])
  const s = useSortable({ items: () => items(), by: (i) => i })
  return (<Stack />)
}
