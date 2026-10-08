import { useCounter } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { Button, Stack } from '@pyreon/primitives'
export function FractionalCounter() {
  const step = signal(0.25)
  const c = useCounter(0, { min: 0.25, max: 2 })
  const record = signal<{ label: string }>({ label: 'counter' })
  return <Stack><Button onPress={() => { c.inc(step()); c.set(1); c.reset() }}>{c.count()}</Button><Button>{record().label}</Button></Stack>
}
export function LargeCounter() {
  const c = useCounter(1e21, { min: 0, max: 2e21 })
  return <Button onPress={() => { c.inc(); c.reset() }}>{c.count()}</Button>
}
