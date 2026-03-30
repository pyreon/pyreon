import { memo, useState } from 'react'
import Demo from './Demo'

const ExpensiveChild = memo(function _ExpensiveChild(props: { value: number }) {
  return (
    <p>
      Memoized component — value: <strong>{props.value}</strong>
    </p>
  )
})

export default function MemoDemo() {
  const [count, setCount] = useState(0)

  return (
    <Demo
      title="Component Memoization"
      apis="memo"
      code={`// In Pyreon, components run once — memo is a no-op
// Kept for API compatibility
const Expensive = memo(function Expensive({ value }) {
  return <p>Value: {value}</p>;
});`}
    >
      <ExpensiveChild value={42} />
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Parent re-render ({count})
      </button>
      <p class="muted">memo is a no-op — Pyreon components run once</p>
    </Demo>
  )
}
