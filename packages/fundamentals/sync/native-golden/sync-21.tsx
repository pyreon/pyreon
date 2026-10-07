import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const doc = new PyreonCrdtDoc()
  const title = syncedSignal({ doc, key: 't', initial: '' })
  const count = syncedSignal({ doc, key: 'c', initial: 2 })
  const frac = syncedSignal({ doc, key: 'f', initial: 1.5 })
  const done = syncedSignal({ doc, key: 'd', initial: false })
  return (<Stack><Text>{title() + String(count()) + String(frac()) + String(done())}</Text></Stack>)
}
