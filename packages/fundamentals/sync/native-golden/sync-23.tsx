import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { Stack, Text } from '@pyreon/primitives'
export function Collab() {
  const doc = new PyreonCrdtDoc()
  const title = syncedSignal({ doc, key: 'title', initial: 'hi' })
  const count = syncedSignal({ doc, key: 'count', initial: 7 })
  const on = syncedSignal({ doc, key: 'on', initial: true })
  const off = syncedSignal({ doc, key: 'off', initial: false })
  return (<Stack><Text>{() => `${title()}${count()}${on()}${off()}`}</Text></Stack>)
}
