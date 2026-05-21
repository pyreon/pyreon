import { signal } from '@pyreon/reactivity'

export function TodoList() {
  const items = signal<{ id: number; label: string }[]>([])
  return (
    <For each={items} by={(item) => item.id}>
      {(item) => <Text>{item.label}</Text>}
    </For>
  )
}
