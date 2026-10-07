import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const items = signal<string[]>(['a', 'b', 'c'])
  const s = useSortable({ items: () => items(), by: (i) => i, onReorder: (n) => items.set(n) })
  return (<Stack ref={s.containerRef}>
    <For each={items()} by={(i) => i}>
      {(item) => <Text ref={s.itemRef(item)}>{item}</Text>}
    </For>
  </Stack>)
}
