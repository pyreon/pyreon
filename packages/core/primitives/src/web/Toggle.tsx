// Web implementation of `<Toggle>` — boolean toggle (checkbox).

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { ToggleProps } from '../types/input'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Toggle>` — boolean toggle.
 *
 * Compiles to:
 * - Web (this impl): `<input type="checkbox" role="switch">` (checked + onChange)
 * - iOS (via PMTC): `Toggle("", isOn: $signal)` — two-way binding via $
 * - Android (via PMTC): `Switch(checked = signal, onCheckedChange = ...)`
 *
 * Web renders a native checkbox with `role="switch"`: it keeps the
 * checkbox's universal keyboard + form behavior (Space toggles, `checked`
 * drives `aria-checked`) while assistive tech announces it as a SWITCH
 * (on/off) — matching the iOS `Toggle` / Android `Switch` so the same
 * `<Toggle>` is announced consistently on every target. The W3C Switch
 * pattern explicitly endorses `input[type=checkbox][role=switch]`. Apps
 * that want toggle-switch chrome style the input via the passthrough
 * `class` / `style` props OR wrap with a custom rendering layer.
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
    // W3C Switch pattern: a checkbox with role="switch" is announced as an
    // on/off switch (the native `checked` maps to aria-checked) — matching
    // the iOS Toggle / Android Switch this lowers to on native targets.
    role: 'switch',
    checked: getValue,
    onChange,
    style: mergePassthroughStyle(style, props.style),
  }
  if (props.disabled) attrs.disabled = true
  return h('input', attrs)
}
