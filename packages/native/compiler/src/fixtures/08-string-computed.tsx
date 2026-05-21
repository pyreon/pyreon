import { computed, signal } from '@pyreon/reactivity'

export function Greeting() {
  const name = signal<string>('world')
  const message = computed(() => 'Hello, ' + name())
  return <Text>{message}</Text>
}
