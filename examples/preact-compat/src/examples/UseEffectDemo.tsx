import { useEffect, useLayoutEffect, useState } from "@pyreon/preact-compat/hooks"
import Demo from "./Demo"

export default function UseEffectDemo() {
  const [count, setCount] = useState(0)
  const [effectLog, setEffectLog] = useState("waiting...")
  const [layoutLog, setLayoutLog] = useState("waiting...")

  useEffect(() => {
    const c = count()
    queueMicrotask(() => {
      setEffectLog(`useEffect ran, count = ${c}`)
    })
  })

  useLayoutEffect(() => {
    const c = count()
    queueMicrotask(() => {
      setLayoutLog(`useLayoutEffect ran, count = ${c}`)
    })
  })

  return (
    <Demo
      title="useEffect & useLayoutEffect"
      apis="useEffect, useLayoutEffect"
      code={`useEffect(() => {
  console.log("count is", count())
})

useLayoutEffect(() => {
  // same API, runs synchronously
})`}
    >
      <p>
        count: <strong>{() => count()}</strong>
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <p class="muted">{() => effectLog()}</p>
      <p class="muted">{() => layoutLog()}</p>
    </Demo>
  )
}
