import { createMachine } from '@pyreon/machine'
export function App(){
  const m = createMachine({
    'initial': 'idle' as const,
    ...extra,
    states: {
      idle: { on: { GO: 'run', 'STOP': 'done', [dyn]: 'x', BAD: 1 }, entry: 1, ...s },
      'run': { on: 'nope' },
      done: {},
      odd: 5,
      ...more,
    },
  })
  return <Text>{m()}</Text>
}
