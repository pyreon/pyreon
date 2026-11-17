import { derived, writable } from 'svelte'
import Demo from './Demo'

const n = writable(2)
const doubled = derived(n, (v: number) => v * 2)

export default function DerivedDemo() {
  let a = 0
  let b = 0
  n.subscribe((v) => (a = v))
  doubled.subscribe((v) => (b = v))

  return (
    <Demo
      title="Derived (single)"
      apis="derived"
      code={`const n = writable(2)
const doubled = derived(n, v => v * 2)`}
    >
      <p>
        n = <strong>{a}</strong>, doubled = <strong>{b}</strong>
      </p>
      <button type="button" onClick={() => n.update((v) => v + 1)}>
        n + 1
      </button>
    </Demo>
  )
}
