import { createMachine } from '@pyreon/machine'
export function App(){
  const m = createMachine({
    initial: 'idle',
    states: {
      [dynState]: { on: { GO: 'run' } },
      idle: { [dynKey]: 1, on: { GO: 'run' } },
      run: {},
    },
  })
  return <Text>{m()}</Text>
}
