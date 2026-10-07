import { createMachine } from '@pyreon/machine'
       import { Stack, Text } from '@pyreon/primitives'
       export function C() {
         const m = createMachine({ initial: 'off', states: { off: { on: { GO: 'on' } }, on: { on: { GO: 'off' } } } })
         return (<Stack><Text>{m()}</Text></Stack>)
       }
