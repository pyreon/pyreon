import { createEventDispatcher, writable } from 'svelte'
import Demo from './Demo'

function Child(props: { onPing?: (e: CustomEvent<number>) => void }) {
  void props
  const dispatch = createEventDispatcher<{ ping: number }>()
  let n = 0
  return (
    <button
      type="button"
      onClick={() => {
        n += 1
        dispatch('ping', n)
      }}
    >
      dispatch ping
    </button>
  )
}

const last = writable('—')

export default function EventDispatcherDemo() {
  let v = '—'
  last.subscribe((x) => (v = x))

  return (
    <Demo
      title="createEventDispatcher"
      apis="createEventDispatcher"
      code={`const dispatch = createEventDispatcher()
dispatch('ping', payload) // → parent onPing prop`}
    >
      <p>
        Last ping detail: <strong>{v}</strong>
      </p>
      <Child onPing={(e: CustomEvent<number>) => last.set(`#${e.detail}`)} />
    </Demo>
  )
}
