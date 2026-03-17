import { useId } from "react"
import Demo from "./Demo"

export default function UseIdDemo() {
  const id1 = useId()
  const id2 = useId()

  return (
    <Demo
      title="Unique IDs"
      apis="useId"
      code={`const id = useId(); // ":r0:"

// Stable, unique per component instance
<label htmlFor={id}>Name</label>
<input id={id} />`}
    >
      <p>
        ID 1: <strong>{id1}</strong> | ID 2: <strong>{id2}</strong>
      </p>
      <div class="row">
        <label>
          {id1}: <input type="text" id={id1} placeholder="First field" />
        </label>
        <label>
          {id2}: <input type="text" id={id2} placeholder="Second field" />
        </label>
      </div>
    </Demo>
  )
}
