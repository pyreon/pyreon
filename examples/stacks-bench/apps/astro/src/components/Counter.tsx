// https://docs.astro.build/en/guides/framework-components/
import { useEffect, useState } from 'preact/hooks'

export default function Counter() {
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
