import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Half of the cross-Example signal-bridge demo. When mounted with
 * `<Example file="./examples/bridge-counter-button" share="bridge" />`,
 * the increment button writes to a SHARED signal. Any other
 * `<Example>` on the same page with `share="bridge"` (e.g. the
 * matching readout below) reads the same signal and reacts.
 *
 * No iframe boundary. No postMessage. Pure Pyreon signal graph.
 * This is the docs DX feature that's STRUCTURALLY IMPOSSIBLE in
 * MDX/Markdoc — they only have static imports, not a shared
 * reactive runtime.
 */
export default function BridgeCounterButton(props: {
  shared?: Signal<number>
}) {
  const count = props.shared ?? signal(0)
  return (
    <div class="example-col">
      <div class="example-muted">
        Click the button. The readout below (a separate
        <code>{' <Example> '}</code>) reacts via the shared signal.
      </div>
      <div class="example-row">
        <button
          type="button"
          class="example-btn"
          onClick={() => count.update((n) => n + 1)}
        >
          + bump
        </button>
        <button
          type="button"
          class="example-btn"
          onClick={() => count.set(0)}
        >
          reset
        </button>
      </div>
      <div class="example-card">
        local view: <strong>{() => String(count())}</strong>
      </div>
    </div>
  )
}
