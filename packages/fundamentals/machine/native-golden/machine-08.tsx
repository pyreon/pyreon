import { createMachine } from '@pyreon/machine'
export function App(){
  const m = createMachine({ [a + b]: 1, initial: 'idle', states: { idle: { on: { [a + b]: 'x', GO: 'idle' } } } })
  return <Text>{m()}</Text>
}
