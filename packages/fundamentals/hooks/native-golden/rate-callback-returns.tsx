import { signal } from '@pyreon/reactivity'
import { useDebouncedCallback, useThrottledCallback } from '@pyreon/hooks'
export function RateCallbacks() {
  const value = signal(0)
  const submit = useDebouncedCallback((v: number) => value.set(v), 20)
  const track = useThrottledCallback((v: number) => { if (v > 0) return value.set(v); value.set(1) }, 30)
  return <Button onPress={() => { submit(1); track(2) }}>{String(value())}</Button>
}
