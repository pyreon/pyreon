import { readonly, writable } from 'svelte'
import Demo from './Demo'

const w = writable(0)
const ro = readonly(w)

export default function ReadonlyDemo() {
  let v = 0
  ro.subscribe((x) => (v = x))

  return (
    <Demo title="Readonly view" apis="readonly" code={`const ro = readonly(w) // subscribe-only`}>
      <p>
        readonly = <strong>{v}</strong> (only the writable can set)
      </p>
      <button type="button" onClick={() => w.update((n) => n + 1)}>
        set via source
      </button>
    </Demo>
  )
}
