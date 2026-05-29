import { For, writable } from 'svelte'
import Demo from './Demo'

const items = writable([1, 2, 3])

export default function ForDemo() {
  let list: number[] = []
  items.subscribe((v) => (list = v))

  return (
    <Demo
      title="For (control-flow re-export)"
      apis="For"
      code={`<For each={list} by={n => n}>…</For>`}
    >
      <ul>
        <For each={() => list} by={(n: number) => n}>
          {(n: number) => <li>item {n}</li>}
        </For>
      </ul>
      <button type="button" onClick={() => items.update((l) => [...l, l.length + 1])}>
        add item
      </button>
    </Demo>
  )
}
