import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — URL-synced State.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function URLSyncedState() {
  const page = signal(1)
  const sort = signal('name')

  return h('div', {},
    h('div', {}, () => 'Page: ' + page() + ' | Sort: ' + sort()),
    h('div', { style: { marginTop: '8px', display: 'flex', gap: '8px' } },
      h('button', { onClick: () => page.update(p => p + 1) }, 'Next Page'),
      h('button', { onClick: () => page.set(1) }, 'Reset'),
      h('button', { onClick: () => sort.set(sort() === 'name' ? 'date' : 'name') }, () => 'Sort: ' + sort()),
    ),
  )
}
