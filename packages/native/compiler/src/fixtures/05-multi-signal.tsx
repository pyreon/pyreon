import { computed, signal } from '@pyreon/reactivity'

export function Sum() {
  const a = signal<number>(1)
  const b = signal<number>(2)
  const total = computed(() => a() + b())
  return <Text>{total}</Text>
}
