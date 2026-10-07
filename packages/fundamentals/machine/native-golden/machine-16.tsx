
import { createMachine } from '@pyreon/machine'
import { Stack, Text } from '@pyreon/primitives'
const thing = createMachine({ initial: 'off', states: { off: { on: { T: 'on' } } } })
export function C() { return (<Stack><Text>x</Text></Stack>) }
