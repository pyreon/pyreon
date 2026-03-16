import { createComputed, createRenderEffect, createSignal } from "@pyreon/solid-compat"
import Demo from "./Demo"

export default function RenderEffectDemo() {
  const [count, setCount] = createSignal(0)
  const [renderLog, setRenderLog] = createSignal<string[]>([])
  const [computedLog, setComputedLog] = createSignal<string[]>([])

  createRenderEffect(() => {
    setRenderLog((prev) => [...prev.slice(-3), `render: ${count()}`])
  })

  createComputed(() => {
    setComputedLog((prev) => [...prev.slice(-3), `computed: ${count()}`])
  })

  return (
    <Demo
      title="Render Effect & Computed"
      apis="createRenderEffect, createComputed"
      code={`// createRenderEffect — runs during render phase
createRenderEffect(() => {
  console.log("render:", count());
});

// createComputed — legacy Solid alias for createEffect
createComputed(() => {
  console.log("computed:", count());
});`}
    >
      <p>
        Count: <strong>{() => count()}</strong>
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <p class="muted">renderEffect: {() => renderLog().join(" | ")}</p>
      <p class="muted">createComputed: {() => computedLog().join(" | ")}</p>
    </Demo>
  )
}
