import { Show, writable } from 'svelte'
import Demo from './Demo'

export default function ShowDemo() {
  const on = writable(true)
  let flag = true
  on.subscribe((v) => (flag = v))

  return (
    <Demo
      title="Show (control-flow re-export)"
      apis="Show"
      code={`<Show when={flag}>…</Show>`}
    >
      <Show when={flag} fallback={<p class="muted">hidden</p>}>
        <p class="highlight">visible ✓</p>
      </Show>
      <button type="button" onClick={() => on.update((v) => !v)}>
        toggle
      </button>
    </Demo>
  )
}
