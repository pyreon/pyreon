import { createMachine } from '@pyreon/machine'
export function App(){
  const m = createMachine(cfg)
  return <Text>{m()}</Text>
}
