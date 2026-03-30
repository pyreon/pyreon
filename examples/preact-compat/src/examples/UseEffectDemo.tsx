import { useEffect, useLayoutEffect, useState } from 'preact/hooks'
import Demo from './Demo'

export default function UseEffectDemo() {
  const [count, setCount] = useState(0)
  const [effectLog, setEffectLog] = useState('waiting...')
  const [layoutLog, setLayoutLog] = useState('waiting...')

  useEffect(() => {
    setEffectLog(`useEffect ran, count = ${count}`)
  }, [count])

  useLayoutEffect(() => {
    setLayoutLog(`useLayoutEffect ran, count = ${count}`)
  }, [count])

  return (
    <Demo
      title="useEffect & useLayoutEffect"
      apis="useEffect, useLayoutEffect"
      code={`useEffect(() => {
  console.log("count is", count)
}, [count])

useLayoutEffect(() => {
  // same API, runs synchronously
}, [count])`}
    >
      <p>
        count: <strong>{count}</strong>
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
      <p class="muted">{effectLog}</p>
      <p class="muted">{layoutLog}</p>
    </Demo>
  )
}
