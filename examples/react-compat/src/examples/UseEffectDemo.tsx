import { useEffect, useState } from "@pyreon/react-compat"
import Demo from "./Demo"

export default function UseEffectDemo() {
  const [count, setCount] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [mountMsg, setMountMsg] = useState("")

  // Reactive effect — deps auto-tracked (no deps array needed!)
  useEffect(() => {
    setLog((prev) => [...prev.slice(-4), `effect: count = ${count()}`])
  })

  // Mount-only effect (empty deps)
  useEffect(() => {
    setMountMsg("Mounted!")
  }, [])

  return (
    <Demo
      title="Side Effects"
      apis="useEffect"
      code={`const [count, setCount] = useState(0);

// Auto-tracked — no deps array needed!
useEffect(() => {
  console.log("count is", count());
});

// Mount-only ([] deps still works)
useEffect(() => {
  console.log("mounted!");
}, []);`}
    >
      <p>
        Count: <strong>{() => count()}</strong> | Mount: <strong>{() => mountMsg()}</strong>
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <p class="muted">Log: {() => log().join(" | ")}</p>
    </Demo>
  )
}
