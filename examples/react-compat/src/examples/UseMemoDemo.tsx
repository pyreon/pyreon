import { useCallback, useMemo, useState } from "react"
import Demo from "./Demo"

export default function UseMemoDemo() {
  const [count, setCount] = useState(1)
  const doubled = useMemo(() => count * 2, [count])
  const quadrupled = useMemo(() => doubled * 2, [doubled])
  const increment = useCallback(() => setCount((c) => c + 1), [])

  return (
    <Demo
      title="Memoization"
      apis="useMemo, useCallback"
      code={`const [count, setCount] = useState(1);

// Deps array controls recomputation
const doubled = useMemo(() => count * 2, [count]);
const quadrupled = useMemo(() => doubled * 2, [doubled]);

// useCallback memoizes the function reference
const increment = useCallback(() =>
  setCount(c => c + 1),
  []
);`}
    >
      <p>
        Count: <strong>{count}</strong> | Doubled: <strong>{doubled}</strong> | Quadrupled:{" "}
        <strong>{quadrupled}</strong>
      </p>
      <button type="button" onClick={increment}>
        Increment (useCallback)
      </button>
    </Demo>
  )
}
