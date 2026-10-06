import { SizedMap } from '@pyreon/sized-map'
import { Stack, Text } from '@pyreon/primitives'

// The package's SizedMap, but not the two-generic shape the lowering reads.
export function Shapes() {
  const none = new SizedMap({ maxEntries: 5 })
  const one = new SizedMap<string>({ maxEntries: 3 })
  const three = new SizedMap<string, number, boolean>({ maxEntries: 3 })
  return <Stack><Text>{String(none.size + one.size + three.size)}</Text></Stack>
}
