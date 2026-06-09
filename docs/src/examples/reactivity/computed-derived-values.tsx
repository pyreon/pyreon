import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Computed — derived values.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function ComputedDerivedValues() {
  // A computed derives from signals (and other computeds). It re-evaluates
  // lazily — only when something reads it AND its dependencies changed.
  const firstName = signal('Alice')
  const lastName = signal('Smith')
  const fullName = computed(() => firstName() + ' ' + lastName())
  const greeting = computed(() => 'Hello, ' + fullName() + '!')

  return h('div', { class: 'col' },
    h('div', { class: 'card' },
      h('div', null,
        h('span', { class: 'muted' }, 'fullName → '),
        h('strong', null, () => fullName()),
      ),
      h('div', { style: { marginTop: '6px' } },
        h('span', { class: 'muted' }, 'greeting → '),
        h('strong', null, () => greeting()),
      ),
    ),
    h('div', { class: 'row' },
      h('button', { onClick: () => firstName.set('Bob') }, 'firstName = Bob'),
      h('button', { onClick: () => lastName.set('Jones') }, 'lastName = Jones'),
      h('button', { onClick: () => { firstName.set('Alice'); lastName.set('Smith') } }, 'reset'),
    ),
  )
}
