import { signal, effect } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Effects — side effects on signal change.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function EffectsSideEffectsOnSignalChange() {
  // An effect runs once at setup, then re-runs whenever any signal
  // it READ during the previous run changes. Use it for side effects:
  // DOM mutation, logging, fetch — anything the rest of the world sees.
  const count = signal(0)
  const log = signal<string[]>([])

  effect(() => {
    // Read count() so this effect re-runs on every change.
    // Use .peek() / .update() to write WITHOUT establishing a dep.
    const c = count()
    log.update((arr) => [...arr, 'count = ' + c].slice(-6))
  })

  return h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('button', { onClick: () => count.update(n => n + 1) }, '＋ Increment'),
      h('button', { onClick: () => count.set(0) }, 'Reset'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'muted', style: { marginBottom: '6px' } }, 'effect log (last 6):'),
      h('div', {
        style: {
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: '12px',
          lineHeight: '1.6',
          whiteSpace: 'pre',
        },
      }, () => log().join('\\n')),
    ),
  )
}
