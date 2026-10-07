import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
export function App(){
  const doc = new PyreonCrdtDoc('a')
  const v = syncedSignal(cfg)
  return <Text>{String(v())}</Text>
}
