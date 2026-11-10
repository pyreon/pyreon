'use client'
// Client Component with state — https://nextjs.org/docs/app/getting-started/server-and-client-components
// useEffect — https://react.dev/reference/react/useEffect
import { useEffect, useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    performance.mark('stacks:island-ready')
  }, [])

  return (
    <button id="counter" type="button" onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  )
}
