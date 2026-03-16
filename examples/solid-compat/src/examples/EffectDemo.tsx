import { createEffect, createSignal } from "@pyreon/solid-compat"
import Demo from "./Demo"

export default function EffectDemo() {
  const [count, setCount] = createSignal(0)
  const [log, setLog] = createSignal<string[]>([])

  createEffect(() => {
    setLog((prev) => [...prev.slice(-4), `Effect ran: count = ${count()}`])
  })

  return (
    <Demo
      title="Side Effects"
      apis="createEffect"
      code={`const [count, setCount] = createSignal(0);

createEffect(() => {
  // Runs whenever count() changes
  console.log("count is", count());
});`}
    >
      <p>
        Count: <strong>{() => count()}</strong>
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <p class="muted">Log: {() => log().join(" | ")}</p>
    </Demo>
  )
}
