import { derived, writable } from 'svelte'
import Demo from './Demo'

const a = writable(1)
const b = writable(2)
const sum = derived([a, b], ([x, y]: [number, number]) => x + y)

export default function DerivedArrayDemo() {
  let s = 0
  sum.subscribe((v) => (s = v))

  return (
    <Demo
      title="Derived (array of stores)"
      apis="derived"
      code={`const sum = derived([a, b], ([x, y]) => x + y)`}
    >
      <p>
        a + b = <strong>{s}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => a.update((v) => v + 1)}>
          a + 1
        </button>
        <button type="button" onClick={() => b.update((v) => v + 1)}>
          b + 1
        </button>
      </div>
    </Demo>
  )
}
