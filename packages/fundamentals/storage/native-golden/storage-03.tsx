import { useStorage } from './mine'
import { createStorage } from '@pyreon/storage'
import { Stack, Text } from '@pyreon/primitives'

export function UserOwned() {
  const b = useStorage<string>('b', 'y')
  return <Stack><Text>{b()}</Text></Stack>
}

const backend = createStorage()
