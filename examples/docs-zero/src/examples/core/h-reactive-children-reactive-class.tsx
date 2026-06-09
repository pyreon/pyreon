import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — h() — reactive children + reactive class.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function HReactiveChildrenReactiveClass() {
  // h() accepts thunks as children AND as attribute values.
  // Thunks track the signals they read and patch in place — the
  // button's class flips between 'badge' and a static class without
  // re-rendering the rest of the tree.
  const active = signal(true)

  return h('div', { class: 'col' },
  h('div', { class: 'row' },
    h('button', { onClick: () => active.update(v => !v) },
      () => active() ? 'Turn off' : 'Turn on',
    ),
    h('span', {
      class: () => active() ? 'badge' : 'muted',
      style: { padding: '4px 10px' },
    }, () => active() ? 'ON' : 'OFF'),
  ),
  h('div', { class: 'muted' }, 'Body runs once; class + label both patch in place.'),
  )
}
