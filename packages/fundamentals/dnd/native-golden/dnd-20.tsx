import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const items = signal<string[]>(['a'])
  const name = signal<string>('a')
  const n = signal<number>(1)
  const s = useSortable({ items: () => items(), by: (i) => i, onReorder: (x) => items.set(x) })
  return (<Stack ref={s.containerRef}><Text ref={s.itemRef(name())}>x</Text></Stack>)
}
