import { signal } from '@pyreon/reactivity'
import { useDraggable, useDroppable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
type Card = { id: string; kind: string }
export function App() {
  const moved = signal('')
  const { ref: dragRef, isDragging } = useDraggable({ data: { id: 'c1', kind: 'card' } })
  const { ref: dropRef, isOver, overEdge } = useDroppable({
    edges: ['top', 'bottom'],
    canDrop: (src: Card) => src.kind === 'card',
    onDrop: (src: Card, loc) => moved.set(src.id + (loc.edge ?? '')),
  })
  return (<Stack>
    <Text ref={dragRef}>{isDragging() ? 'dragging' : 'idle'}</Text>
    <Stack ref={dropRef}><Text>{moved()}</Text><Text>{isOver() ? overEdge() ?? 'over' : 'out'}</Text></Stack>
  </Stack>)
}
