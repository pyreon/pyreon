import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
export function App(){
  const doc = new PyreonCrdtDoc('a')
  const v = syncedSignal({ doc, 'key': 'k', initial: 2 })
  return <Text>{String(v())}</Text>
}
