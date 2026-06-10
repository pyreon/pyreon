import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — useToggle — disclosure pattern.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function UseToggleDisclosurePattern() {
  // useToggle in the playground is just a boolean signal — the real
  // @pyreon/hooks version returns { value, toggle, on, off, set }
  // with reset-on-mount semantics. The shape is identical.
  const isOpen = signal(false)
  const toggle = () => isOpen.update(v => !v)

  return h('div', { class: 'col' },
    h('button', {
      onClick: toggle,
      'aria-expanded': () => isOpen() ? 'true' : 'false',
    }, () => isOpen() ? '▼ Hide details' : '▶ Show details'),
    h('div', {
      class: 'card',
      style: { display: () => isOpen() ? 'block' : 'none' },
    },
      h('div', null, 'Once expanded, this panel survives across toggles.'),
      h('div', { class: 'muted', style: { marginTop: '6px' } },
        'Only `display` patches in place; the DOM tree is preserved.',
      ),
    ),
  )
}
