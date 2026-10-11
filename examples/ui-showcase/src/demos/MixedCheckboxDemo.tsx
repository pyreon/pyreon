import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export function MixedCheckboxDemo() {
  const mixed = signal(true)
  return h(
    'section',
    { 'aria-label': 'Mixed checkbox', style: 'margin-bottom: 24px' },
    h('h3', null, 'Mixed selection'),
    <div>
      <input type="checkbox" disabled indeterminate aria-label="Mixed selection preview" /> Mixed
      preview
    </div>,
    h(
      'label',
      null,
      h('input', {
        type: 'checkbox',
        'aria-label': 'Select all items',
        indeterminate: () => mixed(),
        onChange: (event: Event) =>
          mixed.set((event.currentTarget as HTMLInputElement).indeterminate),
      }),
      ' Select all items',
    ),
    h('p', null, () => (mixed() ? 'Some items are selected.' : 'Selection is no longer mixed.')),
    h('button', { type: 'button', onClick: () => mixed.set(true) }, 'Restore mixed selection'),
  )
}
