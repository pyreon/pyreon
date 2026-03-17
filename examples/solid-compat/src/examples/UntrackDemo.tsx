import { createEffect, createSignal, untrack } from "solid-js"
import Demo from "./Demo"

export default function UntrackDemo() {
  const [tracked, setTracked] = createSignal(0)
  const [untrackedVal, setUntrackedVal] = createSignal(0)
  const [log, setLog] = createSignal("")

  createEffect(() => {
    const t = tracked()
    const u = untrack(() => untrackedVal())
    setLog(`Effect: tracked=${t}, untracked=${u}`)
  })

  return (
    <Demo
      title="Untracked Reads"
      apis="untrack"
      code={`const [tracked, setTracked] = createSignal(0);
const [silent, setSilent] = createSignal(0);

createEffect(() => {
  const t = tracked();
  const s = untrack(() => silent()); // read without subscribing
  console.log(t, s);
});`}
    >
      <button type="button" onClick={() => setTracked((v) => v + 1)}>
        tracked++ ({tracked()}) — triggers effect
      </button>
      <button type="button" onClick={() => setUntrackedVal((v) => v + 1)}>
        untracked++ ({untrackedVal()}) — silent
      </button>
      <p class="muted">{log()}</p>
    </Demo>
  )
}
