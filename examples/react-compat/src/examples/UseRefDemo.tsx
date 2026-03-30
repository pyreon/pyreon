import { useEffect, useRef, useState } from 'react'
import Demo from './Demo'

export default function UseRefDemo() {
  const inputRef = useRef<HTMLInputElement>()
  const renderCount = useRef(0)
  const [value, setValue] = useState('')

  useEffect(() => {
    renderCount.current = (renderCount.current ?? 0) + 1
  })

  return (
    <Demo
      title="Refs"
      apis="useRef"
      code={`const inputRef = useRef<HTMLInputElement>();
const renderCount = useRef(0);

// Focus the input
inputRef.current?.focus();

// Track renders without causing re-renders
renderCount.current++;`}
    >
      <div class="row">
        <input
          type="text"
          ref={inputRef}
          placeholder="Type here..."
          onInput={(e: Event) => setValue((e.target as HTMLInputElement).value)}
        />
        <button type="button" onClick={() => inputRef.current?.focus()}>
          Focus Input
        </button>
      </div>
      <p class="muted">
        Value: {value} | Effect runs: {renderCount.current}
      </p>
    </Demo>
  )
}
