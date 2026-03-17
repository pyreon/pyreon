import { createSignal, Show } from "solid-js"
import Demo from "./Demo"

export default function ShowDemo() {
  const [visible, setVisible] = createSignal(true)

  return (
    <Demo
      title="Conditional Rendering"
      apis="Show"
      code={`const [visible, setVisible] = createSignal(true);

<Show
  when={visible}
  fallback={<p>Nothing to see here</p>}
>
  <p>Hello, I'm visible!</p>
</Show>`}
    >
      <button type="button" onClick={() => setVisible((v) => !v)}>
        Toggle ({visible() ? "visible" : "hidden"})
      </button>
      <Show when={visible} fallback={<p class="muted">Nothing to see here</p>}>
        <p>Hello, I'm visible!</p>
      </Show>
    </Demo>
  )
}
