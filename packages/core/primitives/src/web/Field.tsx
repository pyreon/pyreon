// Web implementation of `<Field>` — text input.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
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
 * Unwrap a `ValueOrSignal<T>` to a callable thunk. The Pyreon compiler
 * already auto-rewraps bare signal references in JSX (see
 * "Reactive vs Static — The Core Rule" in CLAUDE.md), but at the
 * runtime layer we also support plain values + signal-typed objects.
 */
function unwrapValue<T>(value: T | Signal<T> | (() => T)): () => T {
  if (typeof value === 'function') return value as () => T
  // Signals are callable functions in Pyreon — caught by typeof
  // above. Plain values fall here.
  return () => value as T
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
  const getValue = unwrapValue(props.value)
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
