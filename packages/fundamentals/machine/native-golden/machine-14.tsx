
    import { createMachine } from '@pyreon/machine'
    import { Stack, Text } from '@pyreon/primitives'
    export function C() {
      const m = createMachine({
        initial: 'idle',
        states: { idle: { on: { GO: 'run' } }, run: { on: { STOP: 'idle' } } },
      })
      const s = m()
      const ok = m.can('GO')
      const hit = m.matches('idle')
      const ns = m.nextEvents()
      const f = () => { m.send('GO') }
      return (<Stack><Text>{ok && hit ? s : 'n'}</Text></Stack>)
    }
    
