
import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { Stack, Text, Button } from '@pyreon/primitives'
export function CollabScreen() {
  const doc = new PyreonCrdtDoc()
  const title = syncedSignal({ doc, key: 'title', initial: '' })
  const count = syncedSignal({ doc, key: 'count', initial: 0 })
  const done = syncedSignal({ doc, key: 'done', initial: false })
  return (
    <Stack>
      <Text>{title()}</Text>
      <Text>{count()}</Text>
      <Button onPress={() => count.set(count() + 1)}>Inc</Button>
    </Stack>
  )
}
