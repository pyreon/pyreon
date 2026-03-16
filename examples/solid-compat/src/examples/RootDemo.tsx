import { createRoot, createSignal } from "@pyreon/solid-compat"
import Demo from "./Demo"

export default function RootDemo() {
  const [result, setResult] = createSignal("")

  const run = () => {
    createRoot((dispose) => {
      const [val] = createSignal(42)
      setResult(`Created isolated root, read value: ${val()}`)
      dispose()
    })
  }

  return (
    <Demo
      title="Manual Root Scope"
      apis="createRoot"
      code={`createRoot((dispose) => {
  // Create an isolated reactive scope
  const [val, setVal] = createSignal(42);
  console.log(val());

  // Clean up when done
  dispose();
});`}
    >
      <button type="button" onClick={run}>
        Run createRoot
      </button>
      <p class="muted">{() => result()}</p>
    </Demo>
  )
}
