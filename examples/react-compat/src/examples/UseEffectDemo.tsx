import { useEffect, useState } from "react"
import Demo from "./Demo"

export default function UseEffectDemo() {
  const [count, setCount] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [mountMsg, setMountMsg] = useState("")

  // Runs when count changes
  useEffect(() => {
    setLog((prev) => [...prev.slice(-4), `effect: count = ${count}`])
  }, [count])

  // Mount-only effect (empty deps)
  useEffect(() => {
    setMountMsg("Mounted!")
  }, [])

  return (
    <Demo
      title="Side Effects"
      apis="useEffect"
      code={`const [count, setCount] = useState(0);

// Runs when deps change
useEffect(() => {
  console.log("count is", count);
}, [count]);

// Mount-only ([] deps)
useEffect(() => {
  console.log("mounted!");
}, []);`}
    >
      <p>
        Count: <strong>{count}</strong> | Mount: <strong>{mountMsg}</strong>
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <p class="muted">Log: {log.join(" | ")}</p>
    </Demo>
  )
}
