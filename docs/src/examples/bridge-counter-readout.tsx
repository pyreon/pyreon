import { computed, signal, type Signal } from '@pyreon/reactivity'

/**
 * Other half of the cross-Example signal-bridge demo. Reads from the
 * shared signal and displays a derived view (using a computed) to
 * prove the reactivity flows ALL THE WAY through Pyreon's primitives
 * — not just signals, but computed values that depend on shared
 * signals also react in real-time.
 */
export default function BridgeCounterReadout(props: {
  shared?: Signal<number>
}) {
  const count = props.shared ?? signal(0)
  const doubled = computed(() => count() * 2)
  const parity = computed(() => (count() % 2 === 0 ? 'even' : 'odd'))

  return (
    <div class="example-col">
      <div class="example-muted">
        This is a DIFFERENT <code>{' <Example> '}</code> instance.
        Its component never imported the button. They communicate
        via the shared signal — wired by the docs framework, not the
        component.
      </div>
      <div class="example-card">
        <div>
          shared value: <strong>{String(count())}</strong>
        </div>
        <div>
          doubled (computed): <strong>{String(doubled())}</strong>
        </div>
        <div>
          parity (computed): <strong>{parity()}</strong>
        </div>
      </div>
    </div>
  )
}
