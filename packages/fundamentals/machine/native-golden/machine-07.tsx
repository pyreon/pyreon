import { createMachine } from '@pyreon/machine'
export function App(){
  const m = createMachine({ initial: 'a', states: { a: { on: { GO: 'b' } }, b: {} } })
  return <Text>{m()}</Text>
}
