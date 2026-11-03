// Input primitive type definitions — Field / Toggle / Modal.

import type { ChildrenProp, HtmlPassthroughProps, ValueOrSignal } from './shared'

/** Props every `<Field>` shape shares, single-line or multi-line. */
export interface FieldBaseProps extends HtmlPassthroughProps {
  value: ValueOrSignal<string>
  onChangeText: (next: string) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * A single-line `<Field>` — the default. `kind` selects the keyboard +
 * autocomplete behavior per platform (e.g. `kind="email"` → email keyboard on
 * iOS/Android, `<input type="email">` on web).
 */
export interface SingleLineFieldProps extends FieldBaseProps {
  multiline?: false
  lines?: never
  kind?: 'text' | 'number' | 'password' | 'email' | 'search' | 'tel' | 'url'
  /** Submit handler — wired to platform keyboard "Done" / Enter behavior. */
  onSubmit?: () => void
}

/**
 * A multi-line `<Field multiline>` — a text area.
 *
 * `lines` is the number of VISIBLE rows (default 3). The field is that many
 * rows tall on every target and scrolls its content past it, which is what a
 * `<textarea rows>` does on the web: SwiftUI gets `.lineLimit(lines,
 * reservesSpace: true)`, Compose `minLines = lines, maxLines = lines`.
 *
 * `multiline` is STRUCTURAL (a different element on the web, a different
 * initializer on iOS), so it must be a static `true`/`false`. Return inserts a
 * newline, so there is no `onSubmit`, and a text area has no keyboard `kind`.
 */
export interface MultilineFieldProps extends FieldBaseProps {
  multiline: true
  /** Visible rows; the content scrolls beyond them. Default 3. */
  lines?: number
  kind?: 'text'
  onSubmit?: never
}

/**
 * `<Field>` — text input.
 *
 * Per-platform mapping:
 * - Web: `<input type=...>`; `<textarea rows>` with `multiline`
 * - iOS: `TextField` / `SecureField` (kind="password"); `TextField(axis: .vertical)` with `multiline`
 * - Android: single-line `TextField` with `KeyboardOptions`; `minLines`/`maxLines` with `multiline`
 */
export type FieldProps = SingleLineFieldProps | MultilineFieldProps

/**
 * `<Toggle>` — boolean on/off switch.
 *
 * Per-platform mapping:
 * - Web: `<input type="checkbox" role="switch">`
 * - iOS: `Toggle("", isOn: ...)`
 * - Android: `Switch(checked=..., onCheckedChange=...)`
 */
export interface ToggleProps extends HtmlPassthroughProps {
  value: ValueOrSignal<boolean>
  onChange: (next: boolean) => void
  disabled?: boolean
}

/**
 * `<Modal>` — dialog overlay.
 *
 * Per-platform mapping:
 * - Web: `<dialog>` element (native dialog with focus trap + escape)
 * - iOS: `.sheet(isPresented: ...) { ... }`
 * - Android: `Dialog(onDismissRequest = ...) { ... }`
 */
export interface ModalProps extends ChildrenProp, HtmlPassthroughProps {
  open: ValueOrSignal<boolean>
  onClose: () => void
}
