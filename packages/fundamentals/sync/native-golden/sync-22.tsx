import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { Stack, Text } from '@pyreon/primitives'
export function Collab(props: { room: string; nick?: string; limit?: number }) {
  const doc = new PyreonCrdtDoc()
  const title = syncedSignal({ doc, key: 'title', initial: '' })
  const count = syncedSignal({ doc, key: 'count', initial: 0 })
  const done = syncedSignal({ doc, key: 'done', initial: false })
  return (<Stack><Text>{() => `${props.room}${title()}${count()}${done()}`}</Text></Stack>)
}
