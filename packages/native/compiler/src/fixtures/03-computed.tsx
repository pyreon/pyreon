import { computed, signal } from '@pyreon/reactivity'

export function Doubled() {
  const count = signal<number>(0)
  const doubled = computed(() => count() * 2)
  return <Text>{doubled}</Text>
}
