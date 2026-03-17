import { createElement, Fragment, h } from "preact"
import { useState } from "preact/hooks"
import Demo from "./Demo"

export default function HFragmentDemo() {
  const [items, setItems] = useState(["one", "two", "three"])

  return (
    <Demo
      title="h / createElement / Fragment"
      apis="h, createElement, Fragment"
      code={`// h() — hyperscript
h("p", null, "Hello from h()")

// createElement — alias for h
createElement("p", null, "Same thing")

// Fragment — no wrapper node
h(Fragment, null, h("span", null, "A"), h("span", null, "B"))`}
    >
      {h("p", null, "Created with ", h("strong", null, "h()"))}
      {createElement("p", null, "Created with ", createElement("strong", null, "createElement()"))}
      {h(
        Fragment,
        null,
        h("p", { class: "muted" }, "Fragment child 1"),
        h("p", { class: "muted" }, "Fragment child 2"),
      )}
      <p>
        Items: <strong>{items.join(", ")}</strong>
      </p>
      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, `item-${prev.length + 1}`])}
      >
        Add item
      </button>
    </Demo>
  )
}
