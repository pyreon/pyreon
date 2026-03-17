import { cloneElement, h, isValidElement, options, toChildArray } from "preact"
import Demo from "./Demo"

export default function UtilsDemo() {
  const original = h("p", { class: "highlight" }, "Original element")
  const cloned = cloneElement(original, { class: "muted" })
  const nested = [["a", [null, "b"]], "c", false, undefined]
  const flattened = toChildArray(nested)

  return (
    <Demo
      title="Utilities"
      apis="cloneElement, toChildArray, isValidElement, options"
      code={`const el = h("p", { class: "highlight" }, "Original")
const clone = cloneElement(el, { class: "muted" })

toChildArray([["a", [null, "b"]], "c", false])
// => ["a", "b", "c"]

isValidElement(el)  // true
isValidElement(42)  // false

options // {} — plugin hook object`}
    >
      <p>original:</p>
      {original}
      <p>cloneElement (class changed):</p>
      {cloned}
      <p>
        toChildArray result: <strong>{flattened.map(String).join(", ")}</strong>
      </p>
      <p>
        isValidElement(h("p")): <strong>{String(isValidElement(h("p", null)))}</strong> |
        isValidElement(42): <strong>{String(isValidElement(42))}</strong>
      </p>
      <p class="muted">
        options: <strong>{JSON.stringify(options)}</strong> (empty hook object)
      </p>
    </Demo>
  )
}
