// The template's Counter (create-solid v2 basic, src/components/Counter.tsx) with the contract's text,
// plus onMount for the hydration mark.
import { createSignal, onMount } from 'solid-js'

export default function Counter() {
  const [count, setCount] = createSignal(0)
  onMount(() => {
    performance.mark('stacks:island-ready')
  })
  return (
    <button id="counter" type="button" onClick={() => setCount(count() + 1)}>
      Count: {count()}
    </button>
  )
}
