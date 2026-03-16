import { batch, createEffect, createSignal } from "@pyreon/solid-compat"
import Demo from "./Demo"

export default function BatchDemo() {
  const [first, setFirst] = createSignal("John")
  const [last, setLast] = createSignal("Doe")
  const [renderCount, setRenderCount] = createSignal(0)

  createEffect(() => {
    first()
    last()
    setRenderCount((c) => c + 1)
  })

  return (
    <Demo
      title="Batched Updates"
      apis="batch"
      code={`const [first, setFirst] = createSignal("John");
const [last, setLast] = createSignal("Doe");

// Without batch: 2 re-renders
// With batch: 1 re-render
batch(() => {
  setFirst("Jane");
  setLast("Smith");
});`}
    >
      <p>
        Name: <strong>{() => first()}</strong> <strong>{() => last()}</strong>
      </p>
      <p class="muted">Effect runs: {() => renderCount()}</p>
      <button
        type="button"
        onClick={() => {
          batch(() => {
            setFirst((f) => (f === "John" ? "Jane" : "John"))
            setLast((l) => (l === "Doe" ? "Smith" : "Doe"))
          })
        }}
      >
        Swap (batched)
      </button>
    </Demo>
  )
}
