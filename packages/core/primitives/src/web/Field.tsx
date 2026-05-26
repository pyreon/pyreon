// Web implementation of `<Field>` — text input.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { FieldProps } from '../types/input'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * Map canonical `kind` to HTML input `type`. `kind="number"` is a
 * deliberate aliasing — HTML's `type="number"` triggers numeric
 * keyboard on iOS/Android browsers AND constrains input chars.
 */
const KIND_TO_TYPE: Record<string, string> = {
  text: 'text',
  number: 'number',
  password: 'password',
  email: 'email',
  search: 'search',
  tel: 'tel',
  url: 'url',
}

/**
 * `<Field>` — text input.
 *
 * Compiles to:
 * - Web (this impl): `<input type=...>` with onInput → onChangeText
 * - iOS (via PMTC): `TextField` / `SecureField` (kind="password")
 * - Android (via PMTC): `TextField` with `KeyboardOptions`
 */
export const Field = (props: FieldProps): VNode => {
  // CRITICAL: do NOT read `props.value` at setup time. Pyreon's compiler
  // emits signal-shaped props as `_rp(() => signal())` thunks, which
  // `makeReactiveProps` converts to property GETTERS. Reading
  // `props.value` ONCE at setup fires the getter and captures the
  // CURRENT signal value — breaking the reactive chain (renderEffect
  // never tracks because the read happened OUTSIDE the effect scope).
  //
  // Instead, defer the read into a thunk that the renderEffect runs
  // every cycle. Reading `props.value` from INSIDE the effect scope
  // tracks the signal via Pyreon's `_activeEffect` mechanism, so
  // subsequent signal writes refire the effect → write back to
  // `input.value`. Without this fix, `signal.set('')` after the user
  // types via Playwright's `field.fill()` doesn't clear the input
  // (#951 gap #2).
  const getValue = (): string => {
    const v = props.value
    if (typeof v === 'function') return (v as () => string)()
    return v as string
  }
  const kind = props.kind ?? 'text'
  const type = KIND_TO_TYPE[kind] ?? 'text'

  const onInput = (e: Event) => {
    const target = e.target as HTMLInputElement
    props.onChangeText(target.value)
  }

  const onKeyDown = props.onSubmit
    ? (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          props.onSubmit?.()
        }
      }
    : undefined

  const style: Record<string, string> = {
    padding: '8px 12px',
    'border-radius': '6px',
    'border-width': '1px',
    'border-style': 'solid',
    'border-color': '#d1d5db', // gray-300
    'font-size': '14px',
    'font-family': 'inherit',
    'line-height': '1.25',
  }
  if (props.disabled) {
    style.opacity = '0.5'
    style.cursor = 'not-allowed'
  }

  // Pyreon's renderer handles `value` as a reactive prop when it's
  // a function — that's the auto-call compiler behavior. We pass the
  // unwrapped thunk via the getter pattern.
  const attrs: Record<string, unknown> = {
    ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
    type,
    style: mergePassthroughStyle(style, props.style),
    value: getValue,
    onInput,
  }
  if (onKeyDown !== undefined) attrs.onKeyDown = onKeyDown
  if (props.placeholder !== undefined) attrs.placeholder = props.placeholder
  if (props.disabled) attrs.disabled = true
  return h('input', attrs)
}
