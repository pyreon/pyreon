// Web implementation of `<Toggle>` — boolean toggle (checkbox).

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { ToggleProps } from '../types/input'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Toggle>` — boolean toggle.
 *
 * Compiles to:
 * - Web (this impl): `<input type="checkbox">` with checked + onChange
 * - iOS (via PMTC): `Toggle("", isOn: $signal)` — two-way binding via $
 * - Android (via PMTC): `Switch(checked = signal, onCheckedChange = ...)`
 *
 * Web renders as a native checkbox (universal a11y, keyboard support,
 * styleable via CSS). The canonical-vocab choice — Toggle vs Checkbox —
 * matches the semantic split native platforms make (Compose `Switch` /
 * SwiftUI `Toggle`). Apps that want toggle-switch chrome on web can
 * style the input via the passthrough `class` / `style` props OR wrap
 * with a custom rendering layer.
 */
export const Toggle = (props: ToggleProps): VNode => {
  // Same reactive-prop-read pattern as Field — defer the `props.value`
  // read into the thunk so the reactive binding tracks correctly when
  // the compiler emits the prop as a `_rp(() => signal())` getter.
  // See Field.tsx for the full reasoning.
  const getValue = (): boolean => {
    const v = props.value
    if (typeof v === 'function') return (v as () => boolean)()
    return v as boolean
  }
  const onChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    props.onChange(target.checked)
  }
  const style: Record<string, string> = {
    cursor: props.disabled ? 'not-allowed' : 'pointer',
  }
  if (props.disabled) style.opacity = '0.5'

  // Pyreon's renderer handles `checked` as a reactive prop when it's a
  // function — same shape Field uses for `value`.
  const attrs: Record<string, unknown> = {
    ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
    type: 'checkbox',
    checked: getValue,
    onChange,
    style: mergePassthroughStyle(style, props.style),
  }
  if (props.disabled) attrs.disabled = true
  return h('input', attrs)
}
