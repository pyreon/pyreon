import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Component body runs once — only thunks re-run.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function ComponentBodyRunsOnceOnlyThunksReRun() {
  // The component body (this whole code) executes ONCE at mount.
  // Only the thunks (the \`() => ...\` callbacks) re-run when a signal
  // they read changes. That's why h() takes both static values AND
  // thunks — the static parts are baked in at mount.
  const count = signal(0)

  return h('div', { class: 'col' },
    h('div', { class: 'card', style: { textAlign: 'center', fontSize: '32px', fontWeight: '700' } },
      () => count(),
    ),
    h('div', { class: 'row' },
      h('button', { onClick: () => count.update(n => n + 1) }, '＋1'),
      h('button', { onClick: () => count.update(n => n - 1) }, '−1'),
      h('button', { onClick: () => count.set(0) }, 'reset'),
    ),
  )
}
