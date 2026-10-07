
import { createMachine } from '@pyreon/machine'
import { Stack, Text } from '@pyreon/primitives'

export function StateView() {
  const m = createMachine({
    initial: 'idle' as const,
    states: { idle: { on: { FETCH: 'loading' } }, loading: {} },
  })
  return (
    <Stack>
      <Text>{m()}</Text>
    </Stack>
  )
}
