import { get, writable } from 'svelte'
import Demo from './Demo'

const store = writable(10)

export default function GetDemo() {
  let live = 0
  store.subscribe((v) => (live = v)) // drives the re-render
  let snapshot = get(store)

  return (
    <Demo
      title="get — synchronous read"
      apis="get"
      code={`const snapshot = get(store) // no lingering subscription`}
    >
      <p>
        live = <strong>{live}</strong>, last get() = <strong>{snapshot}</strong>
      </p>
      <button
        type="button"
        onClick={() => {
          store.update((n) => n + 5)
          snapshot = get(store)
        }}
      >
        bump + re-read
      </button>
      <p class="muted">get() reads synchronously and leaves no subscription.</p>
    </Demo>
  )
}
