import { SizedMap } from './mine'
import { Stack, Text } from '@pyreon/primitives'

// A SizedMap that is not the package's: generic arguments and a literal option object, but the wrong module.
export function Foreign() {
  const m = new SizedMap<string, number>({ maxEntries: 5 })
  return <Stack><Text>{String(m.size)}</Text></Stack>
}
