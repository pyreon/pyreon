import { writable } from 'svelte'
import Demo from './Demo'

// Module-scope store — persists across the compat wrapper's
// teardown+rebuild re-renders (the canonical Svelte store pattern).
const count = writable(0)

export default function StoreDemo() {
  let c = 0
  count.subscribe((v) => (c = v))

  return (
    <Demo
      title="Reactive State"
      apis="writable"
      code={`const count = writable(0)
let c = 0
count.subscribe(v => (c = v))

count.set(5)
count.update(n => n + 1)`}
    >
      <p>
        Count: <strong>{c}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => count.update((n) => n + 1)}>
          Increment
        </button>
        <button type="button" onClick={() => count.update((n) => n - 1)}>
          Decrement
        </button>
        <button type="button" onClick={() => count.set(0)}>
          Reset
        </button>
      </div>
    </Demo>
  )
}
