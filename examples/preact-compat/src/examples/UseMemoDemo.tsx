import { useCallback, useMemo, useState } from "@pyreon/preact-compat/hooks"
import Demo from "./Demo"

export default function UseMemoDemo() {
  const [a, setA] = useState(3)
  const [b, setB] = useState(7)
  const sum = useMemo(() => a() + b())
  const multiply = useCallback((x: number, y: number) => x * y)

  return (
    <Demo
      title="useMemo & useCallback"
      apis="useMemo, useCallback"
      code={`const sum = useMemo(() => a() + b())
// sum() is auto-tracked

const multiply = useCallback((x, y) => x * y)
// returned as-is (components run once)`}
    >
      <p>
        a: <strong>{() => a()}</strong> | b: <strong>{() => b()}</strong>
      </p>
      <p>
        useMemo sum: <strong>{() => sum()}</strong>
      </p>
      <p>
        useCallback multiply(a, b): <strong>{() => multiply(a(), b())}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => setA((v) => v + 1)}>
          a++
        </button>
        <button type="button" onClick={() => setB((v) => v + 1)}>
          b++
        </button>
      </div>
    </Demo>
  )
}
