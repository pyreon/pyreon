
import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const doc = new PyreonCrdtDoc('fixed-actor')
  const n = syncedSignal({ doc, map: 'room1', key: 'n', initial: 0 })
  return (<Stack><Text>{n()}</Text></Stack>)
}
