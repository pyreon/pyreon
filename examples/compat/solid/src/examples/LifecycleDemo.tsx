import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import Demo from './Demo'

// Inner must be at module scope so the compat wrapper cache sees
// the same function reference across parent re-renders.
function Inner(props: { onEvent: (msg: string) => void }) {
  onMount(() => {
    props.onEvent('mounted')
    return undefined
  })

  onCleanup(() => {
    props.onEvent('cleaned up')
  })

  return <p>Component is alive</p>
}

export default function LifecycleDemo() {
  const [show, setShow] = createSignal(true)
  const [events, setEvents] = createSignal<string[]>([])

  const addEvent = (msg: string) => setEvents((prev) => [...prev.slice(-4), msg])

  return (
    <Demo
      title="Lifecycle Hooks"
      apis="onMount, onCleanup"
      code={`function Inner() {
  onMount(() => {
    console.log("mounted!");
    return undefined;
  });

  onCleanup(() => {
    console.log("cleaned up!");
  });

  return <p>Component is alive</p>;
}`}
    >
      <button type="button" onClick={() => setShow((v) => !v)}>
        {show() ? 'Unmount' : 'Mount'}
      </button>
      <Show when={show}>
        <Inner onEvent={addEvent} />
      </Show>
      <p class="muted">Events: {events().join(' → ')}</p>
    </Demo>
  )
}
