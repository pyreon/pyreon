
import { createMachine } from '@pyreon/machine'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const toggle = createMachine({ initial: 'off', states: { off: { on: { T: 'on' } } } })
  return (<Stack><Text>{toggle()}</Text></Stack>)
}
