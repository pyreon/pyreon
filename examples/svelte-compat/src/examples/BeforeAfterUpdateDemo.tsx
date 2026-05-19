import { afterUpdate, beforeUpdate, writable } from 'svelte'
import Demo from './Demo'

const order = writable<string[]>([])

export default function BeforeAfterUpdateDemo() {
  let log: string[] = []
  order.subscribe((v) => (log = v))

  beforeUpdate(() => order.update((l) => [...l, 'beforeUpdate']))
  afterUpdate(() => order.update((l) => [...l, 'afterUpdate']))

  return (
    <Demo
      title="beforeUpdate / afterUpdate"
      apis="beforeUpdate, afterUpdate"
      code={`beforeUpdate(() => …) // pre-first-render
afterUpdate(() => …)  // post-first-render`}
    >
      <p>
        Order: <strong>{log.join(' → ') || '…'}</strong>
      </p>
      <p class="muted">
        Compat boundary: these map to first-render hooks (the wrapper re-renders by
        teardown+rebuild, not per-tick diffing).
      </p>
    </Demo>
  )
}
