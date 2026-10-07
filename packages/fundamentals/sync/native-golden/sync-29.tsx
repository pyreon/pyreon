import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
const doc = new PyreonCrdtDoc('actor-1')
const shared = syncedSignal({ doc, key: 'title', initial: 'x' })
export function App() {
  const rows = signal([{ id: 1, label: 'a' }])
  const local = new PyreonCrdtDoc('b')
  const title = syncedSignal({ doc: local, key: 'k', initial: 1.5, map: 'm' })
  const plain = PyreonCrdtDoc('c')
  return <Stack><Text>{title()}{rows()[0].label}</Text></Stack>
}
