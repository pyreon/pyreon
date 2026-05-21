import { signal } from '@pyreon/reactivity'

export function Toggle() {
  const visible = signal<boolean>(true)
  return (
    <Show when={visible}>
      <Text>Visible</Text>
    </Show>
  )
}
