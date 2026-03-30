import { createRef } from 'preact'
import { useRef, useState } from 'preact/hooks'
import Demo from './Demo'

export default function UseRefDemo() {
  const inputRef = useRef<HTMLInputElement>()
  const classRef = createRef<HTMLInputElement>()
  const [msg, setMsg] = useState('')

  return (
    <Demo
      title="useRef & createRef"
      apis="useRef, createRef"
      code={`const inputRef = useRef<HTMLInputElement>()
// later: inputRef.current?.focus()

const classRef = createRef<HTMLInputElement>()
// same API`}
    >
      <div class="row">
        <input ref={inputRef} placeholder="useRef input" />
        <button
          type="button"
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.focus()
              setMsg(`Focused useRef input (value: "${inputRef.current.value}")`)
            }
          }}
        >
          Focus useRef
        </button>
      </div>
      <div class="row">
        <input ref={classRef} placeholder="createRef input" />
        <button
          type="button"
          onClick={() => {
            if (classRef.current) {
              classRef.current.focus()
              setMsg(`Focused createRef input (value: "${classRef.current.value}")`)
            }
          }}
        >
          Focus createRef
        </button>
      </div>
      <p class="muted">{msg || 'Click a button to focus an input'}</p>
    </Demo>
  )
}
