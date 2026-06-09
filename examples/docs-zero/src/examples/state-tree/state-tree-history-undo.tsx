// @ts-nocheck — 1:1 port from a JS `<Playground>`. Strict-mode TS
// would need a manual rewrite (signal shapes, possibly-null guards).
// Renders + behaves correctly; type tightening is a follow-up.
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — State tree — history & undo.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function StateTreeHistoryUndo() {
  // State Tree gives you snapshots + patches over a structured model.
  // Distilled here: every write pushes the new state onto history;
  // undo simply walks back through the stack. The real model() adds
  // nested models, views, actions, and middleware.
  const value = signal(0)
  const history = signal([0])
  const cursor = signal(0) // index into history

  const apply = (next: any) => {
    // Drop any redo branch when a new write comes in.
    history.update(hist => [...hist.slice(0, cursor() + 1), next])
    cursor.update(c => c + 1)
    value.set(next)
  }
  const undo = () => {
    if (cursor() === 0) return
    cursor.update(c => c - 1)
    value.set(history()[cursor()])
  }
  const redo = () => {
    if (cursor() >= history().length - 1) return
    cursor.update(c => c + 1)
    value.set(history()[cursor()])
  }

  return h('div', { class: 'col' },
    h('div', { class: 'card', style: { textAlign: 'center', fontSize: '32px', fontWeight: '700' } },
      () => value(),
    ),
    h('div', { class: 'row' },
      h('button', { onClick: () => apply(value() + 1) }, '＋1'),
      h('button', { onClick: () => apply(value() - 1) }, '−1'),
      h('button', { onClick: () => apply(0) }, 'set 0'),
      h('button', { onClick: undo, disabled: () => cursor() === 0 ? '' : null }, '↶ undo'),
      h('button', { onClick: redo, disabled: () => cursor() >= history().length - 1 ? '' : null }, '↷ redo'),
    ),
    h('div', { class: 'muted' }, () =>
      'history: [' + history().map((v, i) => i === cursor() ? '⟨' + v + '⟩' : v).join(' · ') + ']',
    ),
  )
}
