import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack } from '@pyreon/primitives'
export function App() {
  const items = signal<string[]>(['a'])
  const s = useSortable({ items: () => items(), by: (i) => i, onReorder: (n) => items.set(n), label: (i) => i })
  return (<Stack ref={s.containerRef} />)
}
