import { onMount, writable } from 'svelte'
import Demo from './Demo'

const status = writable('pending')

export default function OnMountDemo() {
  let s = 'pending'
  status.subscribe((v) => (s = v))

  onMount(() => {
    status.set('mounted ✓')
    return () => {
      /* cleanup runs on destroy */
    }
  })

  return (
    <Demo
      title="onMount (+ cleanup return)"
      apis="onMount"
      code={`onMount(() => {
  status.set('mounted')
  return () => { /* runs on destroy */ }
})`}
    >
      <p>
        Lifecycle: <strong>{s}</strong>
      </p>
    </Demo>
  )
}
