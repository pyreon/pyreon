import { createEffect, createSignal, on, untrack } from "@pyreon/solid-compat"
import Demo from "./Demo"

export default function OnDemo() {
  const [a, setA] = createSignal(1)
  const [b, setB] = createSignal(10)
  const [result, setResult] = createSignal("(click a++ to start)")

  createEffect(
    on(
      () => a(),
      (val, prev) => {
        setResult(`a: ${prev} → ${val} (b=${untrack(b)} not tracked)`)
      },
    ),
  )

  return (
    <Demo
      title="Explicit Dependencies"
      apis="on"
      code={`const [a, setA] = createSignal(1);
const [b, setB] = createSignal(10);

createEffect(on(
  () => a(),           // only track a
  (val, prev) => {
    console.log(val, prev, untrack(b));
  }
));`}
    >
      <button type="button" onClick={() => setA((v) => v + 1)}>
        a++ ({() => a()}) — triggers
      </button>
      <button type="button" onClick={() => setB((v) => v + 1)}>
        b++ ({() => b()}) — silent
      </button>
      <p class="muted">{() => result()}</p>
    </Demo>
  )
}
