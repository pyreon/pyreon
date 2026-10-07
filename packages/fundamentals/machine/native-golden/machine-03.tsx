import { createMachine } from '@pyreon/machine'
export function App(){
  const m = createMachine()
  return <Text>{m()}</Text>
}
