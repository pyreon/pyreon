import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Signals — read, write, react.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function SignalsReadWriteReact() {
  // A signal is a reactive container. Read it as a function: count()
  // Write with .set() or .update(). Any signal call inside a thunk
  // re-runs that thunk when the signal changes.
  const count = signal(0)

  return h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('button', { onClick: () => count.update(n => n + 1) }, '＋ Increment'),
      h('button', { onClick: () => count.update(n => n - 1) }, '− Decrement'),
      h('button', { onClick: () => count.set(0) }, 'Reset'),
    ),
    h('div', { class: 'card' },
      h('span', { class: 'muted' }, 'count: '),
      h('span', { class: 'badge' }, () => count()),
    ),
  )
}
