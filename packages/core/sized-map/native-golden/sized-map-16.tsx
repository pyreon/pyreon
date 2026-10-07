import { SizedMap } from '@pyreon/sized-map'
import { Stack, Text } from '@pyreon/primitives'

// A plain CALL of the name is not a construction.
export function Called() {
  const m = SizedMap<string, number>({ maxEntries: 5 })
  return <Stack><Text>{String(m)}</Text></Stack>
}
