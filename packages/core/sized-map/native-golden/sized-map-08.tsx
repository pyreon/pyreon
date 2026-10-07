import { Stack, Text } from '@pyreon/primitives'
import { SizedMap } from '@pyreon/sized-map'
const seen = new SizedMap<string, number>({ maxEntries: 8 })
export function A() {
  return <Stack><Text>{String(seen.size)}</Text></Stack>
}
