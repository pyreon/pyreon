import { createMachine } from '@pyreon/machine'
export function App(){
  const m = createMachine({ initial: 'a', states: s })
  return <Text>{m()}</Text>
}
