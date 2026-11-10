// The interactive widget: a useState counter (https://react.dev/learn/state-a-components-memory).
import { useEffect, useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    performance.mark('stacks:island-ready')
  }, [])
  return (
    <button id="counter" type="button" onClick={() => setCount((c) => c + 1)}>
      Count: {count}
    </button>
  )
}
