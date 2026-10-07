import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
export function App(){
  const doc = new PyreonCrdtDoc('a')
  const v = syncedSignal({ doc: doc, key: 'k', initial: true, map: 'm', ...rest })
  return <Text>{String(v())}</Text>
}
