import { Match, Switch, writable } from 'svelte'
import Demo from './Demo'

export default function SwitchDemo() {
  const step = writable(0)
  let s = 0
  step.subscribe((v) => (s = v))

  return (
    <Demo
      title="Switch / Match (control-flow re-export)"
      apis="Switch, Match"
      code={`<Switch>
  <Match when={s === 0}>zero</Match>
  <Match when={s === 1}>one</Match>
</Switch>`}
    >
      <Switch fallback={<p class="muted">other</p>}>
        <Match when={s === 0}>
          <p class="badge">zero</p>
        </Match>
        <Match when={s === 1}>
          <p class="badge">one</p>
        </Match>
      </Switch>
      <button type="button" onClick={() => step.update((v) => (v + 1) % 3)}>
        next step ({s})
      </button>
    </Demo>
  )
}
