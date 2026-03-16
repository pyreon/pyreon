import { createSignal, onCleanup, onMount, Show } from "@pyreon/solid-compat"
import Demo from "./Demo"

export default function LifecycleDemo() {
  const [show, setShow] = createSignal(true)
  const [events, setEvents] = createSignal<string[]>([])

  function Inner() {
    onMount(() => {
      setEvents((prev) => [...prev.slice(-4), "mounted"])
      return undefined
    })

    onCleanup(() => {
      setEvents((prev) => [...prev.slice(-4), "cleaned up"])
    })

    return <p>Component is alive</p>
  }

  return (
    <Demo
      title="Lifecycle Hooks"
      apis="onMount, onCleanup"
      code={`function Inner() {
  onMount(() => {
    console.log("mounted!");
    return undefined;
  });

  onCleanup(() => {
    console.log("cleaned up!");
  });

  return <p>Component is alive</p>;
}`}
    >
      <button type="button" onClick={() => setShow((v) => !v)}>
        {() => (show() ? "Unmount" : "Mount")}
      </button>
      <Show when={show}>
        <Inner />
      </Show>
      <p class="muted">Events: {() => events().join(" → ")}</p>
    </Demo>
  )
}
