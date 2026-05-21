import { signal } from '@pyreon/reactivity'

export function Increment() {
  const count = signal<number>(0)
  return <Button onClick={() => count.set(count() + 1)}>Increment</Button>
}
