import { useImperativeHandle, useRef, useState } from "react"
import Demo from "./Demo"

export default function UseImperativeHandleDemo() {
  const ref = useRef<{ focus: () => void }>()
  const [msg, setMsg] = useState("")

  function FancyInput(props: { inputRef: { current: { focus: () => void } | null } }) {
    const realInput = useRef<HTMLInputElement>()

    useImperativeHandle(props.inputRef, () => ({
      focus: () => {
        realInput.current?.focus()
        setMsg("Focused via imperative handle!")
      },
    }))

    return <input type="text" ref={realInput} placeholder="Fancy input" />
  }

  return (
    <Demo
      title="Imperative Handle"
      apis="useImperativeHandle"
      code={`function FancyInput({ inputRef }) {
  const realInput = useRef();

  useImperativeHandle(inputRef, () => ({
    focus: () => realInput.current?.focus(),
  }));

  return <input ref={realInput} />;
}

// Parent
const ref = useRef();
ref.current?.focus();`}
    >
      <FancyInput inputRef={ref} />
      <button type="button" onClick={() => ref.current?.focus()}>
        Focus via Handle
      </button>
      <p class="muted">{msg}</p>
    </Demo>
  )
}
