import { createMachine } from '@pyreon/machine'
import { Text } from '@pyreon/primitives'
export function App(){
  const EV = 'GO'
  const m = createMachine({ initial: 'a', states: { a: { on: { [EV]: 'b' } }, b: {} } })
  return <Text>x</Text>
}
