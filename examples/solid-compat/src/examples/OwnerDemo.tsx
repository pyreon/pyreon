import { createSignal, getOwner, runWithOwner } from "solid-js"
import Demo from "./Demo"

export default function OwnerDemo() {
  const [result, setResult] = createSignal("")

  const run = () => {
    const owner = getOwner()
    setResult(owner ? "Captured current owner scope" : "No owner (outside reactive scope)")

    if (owner) {
      setTimeout(() => {
        runWithOwner(owner, () => {
          setResult("Ran async work inside captured owner scope!")
        })
      }, 500)
    }
  }

  return (
    <Demo
      title="Owner Scope"
      apis="getOwner, runWithOwner"
      code={`// Capture the current reactive scope
const owner = getOwner();

// Run async work in the captured scope
setTimeout(() => {
  runWithOwner(owner, () => {
    // Has access to the original scope
    createEffect(() => { ... });
  });
}, 1000);`}
    >
      <button type="button" onClick={run}>
        Capture & Run
      </button>
      <p class="muted">{result()}</p>
    </Demo>
  )
}
