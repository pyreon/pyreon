import { createMachine } from '@pyreon/machine'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const m = createMachine({ initial: 'idle', states: { idle: { on: { GO: 'done' } }, done: {} } })
  return (<Stack><Text>{m()}</Text></Stack>)
}
