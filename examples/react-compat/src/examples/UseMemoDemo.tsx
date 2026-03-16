import { useCallback, useMemo, useState } from "@pyreon/react-compat"
import Demo from "./Demo"

export default function UseMemoDemo() {
  const [count, setCount] = useState(1)
  const doubled = useMemo(() => count() * 2)
  const quadrupled = useMemo(() => doubled() * 2)
  const increment = useCallback(() => setCount((c) => c + 1))

  return (
    <Demo
      title="Memoization"
      apis="useMemo, useCallback"
      code={`const [count, setCount] = useState(1);

// Auto-tracked — no deps array needed!
const doubled = useMemo(() => count() * 2);
const quadrupled = useMemo(() => doubled() * 2);

// useCallback is identity — no stale closures
const increment = useCallback(() =>
  setCount(c => c + 1)
);`}
    >
      <p>
        Count: <strong>{() => count()}</strong> | Doubled: <strong>{() => doubled()}</strong> |
        Quadrupled: <strong>{() => quadrupled()}</strong>
      </p>
      <button type="button" onClick={increment}>
        Increment (useCallback)
      </button>
    </Demo>
  )
}
