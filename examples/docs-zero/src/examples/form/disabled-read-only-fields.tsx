import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Disabled & read-only fields.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function DisabledReadOnlyFields() {
  const name = signal('Alice')
  const role = signal('Designer')
  const disabled = signal(false)
  const readOnly = signal(false)

  return h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('label', { class: 'row', style: { gap: '6px' } },
        h('input', { type: 'checkbox', onChange: () => disabled.update(v => !v) }),
        h('span', null, 'disabled'),
      ),
      h('label', { class: 'row', style: { gap: '6px' } },
        h('input', { type: 'checkbox', onChange: () => readOnly.update(v => !v) }),
        h('span', null, 'readOnly'),
      ),
    ),
    h('div', { class: 'col', style: { gap: '6px' } },
      h('input', {
        value: () => name(),
        onInput: (e: any) => name.set(e.target.value),
        disabled: () => disabled() ? '' : null,
        readonly: () => readOnly() ? '' : null,
      }),
      h('input', {
        value: () => role(),
        onInput: (e: any) => role.set(e.target.value),
        disabled: () => disabled() ? '' : null,
        readonly: () => readOnly() ? '' : null,
      }),
    ),
    h('div', { class: 'card' },
      h('span', { class: 'muted' }, 'snapshot: '),
      h('strong', null, () => name() + ' · ' + role()),
    ),
  )
}
