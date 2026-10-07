import { createMachine } from '@pyreon/machine'
export function App(){
  const m = createMachine({ initial: 'a' })
  return <Text>{m()}</Text>
}
