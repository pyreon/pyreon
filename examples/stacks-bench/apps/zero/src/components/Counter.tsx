// The interactive widget: a signal-backed counter, written like the create-zero
// template's counter route (packages/zero/create-zero/templates/app/src/routes/counter.tsx)
// with the standard `signal` API. `onMount` runs after the page has hydrated.
import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export function Counter() {
  const count = signal(0)
  onMount(() => {
    performance.mark('stacks:island-ready')
  })
  return (
    <button id="counter" type="button" onClick={() => count.update((n) => n + 1)}>
      Count: {count()}
    </button>
  )
}
