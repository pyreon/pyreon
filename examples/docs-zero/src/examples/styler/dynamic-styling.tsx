import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Dynamic Styling.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function DynamicStyling() {
  const color = signal('#0d6efd')
  const size = signal(16)

  return h('div', {},
    h('div', { style: () => ({ color: color(), fontSize: size() + 'px', fontWeight: 'bold', marginBottom: '8px' }) }, 'Styled Text'),
    h('input', { type: 'color', value: color, onInput: (e: any) => color.set(e.target.value) }),
    h('input', { type: 'range', min: '12', max: '36', value: size, onInput: (e: any) => size.set(Number(e.target.value)), style: { marginLeft: '8px' } }),
    h('span', { style: { marginLeft: '8px', fontSize: '12px' } }, () => size() + 'px'),
  )
}
