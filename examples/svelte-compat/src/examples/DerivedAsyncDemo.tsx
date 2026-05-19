import { derived, writable } from 'svelte'
import Demo from './Demo'

const id = writable(1)
const data = derived(
  id,
  (currentId: number, set: (x: string) => void) => {
    const t = setTimeout(() => set(`loaded #${currentId}`), 150)
    return () => clearTimeout(t)
  },
  'loading…',
)

export default function DerivedAsyncDemo() {
  let view = 'loading…'
  data.subscribe((v) => (view = v))

  return (
    <Demo
      title="Derived (async / cleanup form)"
      apis="derived"
      code={`derived(id, (cur, set) => {
  const t = setTimeout(() => set(\`loaded #\${cur}\`), 150)
  return () => clearTimeout(t)
}, 'loading…')`}
    >
      <p>
        Status: <strong>{view}</strong>
      </p>
      <button type="button" onClick={() => id.update((v) => v + 1)}>
        Reload
      </button>
    </Demo>
  )
}
