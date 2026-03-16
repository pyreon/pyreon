import { createSignal, ErrorBoundary, Show } from "@pyreon/solid-compat"
import Demo from "./Demo"

function Bomb() {
  throw new Error("Boom!")
}

export default function ErrorDemo() {
  const [explode, setExplode] = createSignal(false)

  return (
    <Demo
      title="Error Handling"
      apis="ErrorBoundary"
      code={`<ErrorBoundary
  fallback={(err) => <p>Caught: {err.message}</p>}
>
  <RiskyComponent />
</ErrorBoundary>`}
    >
      <button type="button" onClick={() => setExplode(true)}>
        Trigger Error
      </button>
      <button type="button" onClick={() => setExplode(false)}>
        Reset
      </button>
      <ErrorBoundary
        fallback={(err: unknown, _reset: () => void) => (
          <p class="error-msg">Caught: {(err as Error).message}</p>
        )}
      >
        <Show when={explode}>
          <Bomb />
        </Show>
        <Show when={() => !explode()}>
          <p class="muted">No errors yet — click to trigger</p>
        </Show>
      </ErrorBoundary>
    </Demo>
  )
}
