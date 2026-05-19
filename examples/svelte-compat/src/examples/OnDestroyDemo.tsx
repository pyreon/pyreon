import { onDestroy, writable } from 'svelte'
import Demo from './Demo'

function Child(props: { onGone: () => void }) {
  onDestroy(() => props.onGone())
  return <p class="badge">child alive</p>
}

// Module-scope stores persist across the wrapper's teardown+rebuild
// re-renders, so the destroy message survives the toggle re-render.
const shown = writable(true)
const lastLog = writable('—')

export default function OnDestroyDemo() {
  let visible = true
  let log = '—'
  shown.subscribe((v) => (visible = v))
  lastLog.subscribe((v) => (log = v))

  return (
    <Demo
      title="onDestroy"
      apis="onDestroy"
      code={`function Child() {
  onDestroy(() => log('child destroyed'))
}`}
    >
      <p>
        Last: <strong>{log}</strong>
      </p>
      {visible ? (
        <Child onGone={() => lastLog.set('child destroyed')} />
      ) : (
        <p class="muted">child unmounted</p>
      )}
      <button type="button" onClick={() => shown.update((v) => !v)}>
        toggle child
      </button>
    </Demo>
  )
}
