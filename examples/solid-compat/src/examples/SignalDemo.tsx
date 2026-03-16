import { createSignal } from "@pyreon/solid-compat"
import Demo from "./Demo"

export default function SignalDemo() {
  const [count, setCount] = createSignal(0)

  return (
    <Demo
      title="Reactive State"
      apis="createSignal"
      code={`const [count, setCount] = createSignal(0);

// Read with getter
<span>Count: {count()}</span>

// Set directly
setCount(5);

// Update with function
setCount(prev => prev + 1);`}
    >
      <p>
        Count: <strong>{() => count()}</strong>
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <button type="button" onClick={() => setCount((c) => c - 1)}>
        Decrement
      </button>
      <button type="button" onClick={() => setCount(0)}>
        Reset
      </button>
    </Demo>
  )
}
