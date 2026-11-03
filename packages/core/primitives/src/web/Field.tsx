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
 * Visible rows of a `<Field multiline>` when `lines` is omitted. The PMTC
 * emitters carry the same number (`FIELD_DEFAULT_LINES` in
 * `@pyreon/native-compiler`'s canonical-primitives) — set explicitly here
 * rather than left to the browser's `rows` default of 2, so all three targets
 * agree on the height of the same source.
 */
export const FIELD_DEFAULT_LINES = 3

/**
 * `<Field>` — text input.
 *
 * Compiles to:
 * - Web (this impl): `<input type=...>` with onInput → onChangeText;
 *   `<textarea rows>` when `multiline`
 * - iOS (via PMTC): `TextField` / `SecureField` (kind="password");
 *   `TextField(axis: .vertical)` when `multiline`
 * - Android (via PMTC): single-line `TextField` with `KeyboardOptions`;
 *   `minLines`/`maxLines` when `multiline`
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
  // types via Playwright's `field.fill()` doesn't clear the input.
  const getValue = (): string => {
    const v = props.value
    if (typeof v === 'function') return (v as () => string)()
    return v as string
  }
  // `multiline` is STRUCTURAL — it selects the element — so it is read once,
  // exactly as the native emitters read it statically.
  const multiline = props.multiline === true
  const kind = props.kind ?? 'text'
  const type = KIND_TO_TYPE[kind] ?? 'text'

  const onInput = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    props.onChangeText(target.value)
  }

  // A text area's Enter inserts a newline, so it never submits — the type
  // forbids `onSubmit` on the multiline shape, and this guards untyped callers.
  const onKeyDown =
    !multiline && props.onSubmit
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
  // A user-resized textarea would break the fixed-row contract the native
  // targets keep; the height is the `lines` prop's to decide.
  if (multiline) style.resize = 'none'

  // Pyreon's renderer handles `value` as a reactive prop when it's
  // a function — that's the auto-call compiler behavior. We pass the
  // unwrapped thunk via the getter pattern.
  const attrs: Record<string, unknown> = {
    ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
    style: mergePassthroughStyle(style, props),
    value: getValue,
    onInput,
  }
  if (multiline) {
    // `rows` is the visible height; the content scrolls past it, matching the
    // fixed-height native lowerings. Read through a thunk so a reactive
    // `lines` stays live (it is a value, not a structural choice).
    attrs.rows = () => {
      const lines = (props as { lines?: number }).lines
      return lines !== undefined && lines >= 1 ? Math.floor(lines) : FIELD_DEFAULT_LINES
    }
  } else {
    attrs.type = type
  }
  if (onKeyDown) attrs.onKeyDown = onKeyDown
  if (props.placeholder !== undefined) attrs.placeholder = props.placeholder
  if (props.disabled) attrs.disabled = true
  return h(multiline ? 'textarea' : 'input', attrs)
}
