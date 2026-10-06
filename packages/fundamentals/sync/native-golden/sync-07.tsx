import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
export function App(){
  const doc = new PyreonCrdtDoc('a')
  const v = syncedSignal({ doc: getDoc(), key: 'k', initial: 1 })
  return <Text>{String(v())}</Text>
}
