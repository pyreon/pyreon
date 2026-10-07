import { useStorage as usePersisted, useSessionStorage as useTab } from '@pyreon/storage'
import { Stack, Text } from '@pyreon/primitives'

export function Aliased() {
  const a = usePersisted<string>('a', 'x')
  const t = useTab<number>('t', 2)
  return <Stack><Text>{a()}</Text><Text>{t()}</Text></Stack>
}
