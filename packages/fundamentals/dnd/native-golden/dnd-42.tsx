import { signal } from '@pyreon/reactivity'
import { useDraggable, useDroppable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
type Card = { id: string; kind: string }
export function App() {
  const locked = signal(false)
  const d = useDraggable({ data: () => ({ id: 'c2', n: 3 }), disabled: () => locked() })
  const z = useDroppable({ onDrop: (src: Card) => { locked.set(true) }, onDragEnter: () => locked.set(false) })
  return (<Stack><Text ref={d.ref}>a</Text><Stack ref={z.ref}><Text>b</Text></Stack></Stack>)
}
