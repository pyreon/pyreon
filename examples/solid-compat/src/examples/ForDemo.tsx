import { createSignal, For } from "@pyreon/solid-compat"
import Demo from "./Demo"

export default function ForDemo() {
  const [items, setItems] = createSignal([
    { id: 1, text: "Learn Pyreon" },
    { id: 2, text: "Build an app" },
    { id: 3, text: "Ship it" },
  ])
  let nextId = 4

  return (
    <Demo
      title="Keyed List Rendering"
      apis="For"
      code={`const [items, setItems] = createSignal([
  { id: 1, text: "Learn Pyreon" },
  { id: 2, text: "Build an app" },
]);

<For each={items} by={item => item.id}>
  {item => <li>{item.text}</li>}
</For>`}
    >
      <div class="row">
        <button
          type="button"
          onClick={() =>
            setItems((prev) => [...prev, { id: nextId++, text: `Task ${nextId - 1}` }])
          }
        >
          Add
        </button>
        <button type="button" onClick={() => setItems((prev) => prev.slice(0, -1))}>
          Remove Last
        </button>
        <button type="button" onClick={() => setItems([])}>
          Clear
        </button>
      </div>
      <ul>
        <For each={items} by={(item) => item.id} children={(item) => <li>{item.text}</li>} />
      </ul>
    </Demo>
  )
}
