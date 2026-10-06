import { createMachine } from '@pyreon/machine'
export function App(){
  const m = createMachine({ initial: 1, states: {} })
  return <Text>{m()}</Text>
}
