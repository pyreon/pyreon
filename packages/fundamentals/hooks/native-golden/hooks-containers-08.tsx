import { useSecureStorage, useMap } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'

// Calls with MORE arguments than the labelled surface declares are not rewritten (a wrong call must still surface as a compiler error).
export function Over() {
  const vault = useSecureStorage()
  const map = useMap()
  return (
    <Stack>
      <Button onPress={() => vault.write('k', 'v', 'extra')}>w</Button>
      <Button onPress={() => map.moveTo(1, 2, 3, 4)}>m</Button>
    </Stack>
  )
}
