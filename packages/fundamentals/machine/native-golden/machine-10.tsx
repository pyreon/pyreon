import { Stack, Text } from '@pyreon/primitives'
import { createMachine } from '@pyreon/machine'
export function App() {
  const m1 = createMachine({ initial: 'idle', states: { idle: { on: { GO: 'run' } }, run: { on: {} } } })
  const m2 = createMachine({ initial: 'idle', states: {} })
  return (<Stack><Text>{() => `${m1()}${m2()}`}</Text></Stack>)
}
