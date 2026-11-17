import { tick, writable } from 'svelte'
import Demo from './Demo'

const state = writable('idle')

export default function TickDemo() {
  let s = 'idle'
  state.subscribe((v) => (s = v))

  async function run() {
    state.set('working…')
    await tick()
    state.set('done after tick ✓')
  }

  return (
    <Demo
      title="tick"
      apis="tick"
      code={`await tick() // resolves after the current microtask`}
    >
      <p>
        State: <strong>{s}</strong>
      </p>
      <button type="button" onClick={run}>
        run async + tick
      </button>
    </Demo>
  )
}
