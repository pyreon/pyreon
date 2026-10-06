import { createMachine } from '@pyreon/machine'
import { signal } from '@pyreon/reactivity'
export function App(){
  const m = createMachine({ initial: 'idle', states: { idle: { on: { GO: 'run' } }, run: {} } })
  const items = signal([{ id: 1, label: 'a' }])
  return <Text>{m()}{items()[0].label}</Text>
}
