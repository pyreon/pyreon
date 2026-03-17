import { useState } from "preact/hooks"
import Demo from "./Demo"

export default function UseStateDemo() {
  const [count, setCount] = useState(0)
  const [name, setName] = useState("Preact")

  return (
    <Demo
      title="useState"
      apis="useState"
      code={`const [count, setCount] = useState(0)
setCount(count + 1)
setCount(prev => prev + 1)`}
    >
      <p>
        count: <strong>{count}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => setCount((c) => c + 1)}>
          Increment
        </button>
        <button type="button" onClick={() => setCount((c) => c - 1)}>
          Decrement
        </button>
        <button type="button" onClick={() => setCount(0)}>
          Reset
        </button>
      </div>
      <p>
        name: <strong>{name}</strong>
      </p>
      <div class="row">
        <input value={name} onInput={(e: Event) => setName((e.target as HTMLInputElement).value)} />
      </div>
    </Demo>
  )
}
