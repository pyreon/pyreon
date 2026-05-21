import { signal } from '@pyreon/reactivity'

export function Counter() {
  const count = signal<number>(0)
  return <Text>{count}</Text>
}
