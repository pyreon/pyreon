import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
export function App(){
  const doc = new PyreonCrdtDoc('a')
  const v = syncedSignal({ doc, key: 'k', initial: 'x' })
  return <Text>{String(v())}</Text>
}
