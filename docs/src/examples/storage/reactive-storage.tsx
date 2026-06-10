import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Reactive Storage.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function ReactiveStorage() {
  const theme = signal('light')

  return h('div', {},
    h('div', { style: () => ({ padding: '12px', borderRadius: '8px', background: theme() === 'dark' ? '#1a1a2e' : '#f8f9fa', color: theme() === 'dark' ? '#e2e8f0' : '#1a1a2e', transition: 'all 0.3s' }) },
      h('span', {}, () => 'Current theme: ' + theme()),
      h('button', { onClick: () => theme.set(theme() === 'light' ? 'dark' : 'light'), style: { marginLeft: '12px' } }, 'Toggle'),
    ),
  )
}
