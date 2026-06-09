import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — State machine — only valid transitions fire.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function StateMachineOnlyValidTransitionsFire() {
  // A state machine is a signal + a transition table. Invalid events
  // for the current state are no-ops — impossible states stay
  // structurally impossible.
  const state = signal('idle')
  const transitions = {
    idle:    { FETCH: 'loading' },
    loading: { SUCCESS: 'done', ERROR: 'error' },
    done:    { RESET: 'idle' },
    error:   { RETRY: 'loading', RESET: 'idle' },
  }
  const send = (event: any) => {
    const next = (transitions as Record<string, any>)[state()]?.[event]
    if (next) state.set(next)
  }
  const allowed = computed(() => Object.keys((transitions as Record<string, any>)[state()] || {}))

  return h('div', { class: 'col' },
    h('div', { class: 'card', style: { textAlign: 'center' } },
      h('div', { class: 'muted' }, 'current state'),
      h('div', { style: { fontSize: '22px', fontWeight: '700', marginTop: '4px' } },
        h('span', { class: 'badge' }, () => state()),
      ),
    ),
    h('div', { class: 'row' }, () =>
      ['FETCH', 'SUCCESS', 'ERROR', 'RETRY', 'RESET'].map((ev) =>
        h('button', {
          onClick: () => send(ev),
          disabled: () => allowed().includes(ev) ? null : '',
          style: { opacity: () => allowed().includes(ev) ? 1 : 0.4 },
        }, ev),
      ),
    ),
    h('div', { class: 'muted' }, () => 'allowed: ' + allowed().join(', ')),
  )
}
