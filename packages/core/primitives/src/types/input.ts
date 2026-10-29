// Input primitive type definitions — Field / Toggle / Modal.

import type { ChildrenProp, HtmlPassthroughProps, ValueOrSignal } from './shared'

/** Props every `<Field>` shape shares — text, multi-line, or a date / time picker. */
export interface FieldBaseProps extends HtmlPassthroughProps {
  value: ValueOrSignal<string>
  onChangeText: (next: string) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * A single-line text `<Field>` — the default. `kind` selects the keyboard +
 * autocomplete behavior per platform (e.g. `kind="email"` → email keyboard on
 * iOS/Android, `<input type="email">` on web).
 */
export interface SingleLineFieldProps extends FieldBaseProps {
  multiline?: false
  lines?: never
  kind?: 'text' | 'number' | 'password' | 'email' | 'search' | 'tel' | 'url'
  /** Submit handler — wired to platform keyboard "Done" / Enter behavior. */
  onSubmit?: () => void
  min?: never
  max?: never
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
 * newline, so there is no `onSubmit`, and a text area has no keyboard `kind`
 * and no date / time picker — `multiline` and a date `kind` are mutually
 * exclusive.
 */
export interface MultilineFieldProps extends FieldBaseProps {
  multiline: true
  /** Visible rows; the content scrolls beyond them. Default 3. */
  lines?: number
  kind?: 'text'
  onSubmit?: never
  min?: never
  max?: never
}

/**
 * A date / time `<Field>` — the platform's own picker.
 *
 * The VALUE is the web's own wall-clock string, with no time zone:
 * - `kind="date"` → `"YYYY-MM-DD"` (`<input type="date">`)
 * - `kind="time"` → `"HH:mm"`, 24-hour (`<input type="time">`)
 * - `kind="datetime"` → `"YYYY-MM-DDTHH:mm"` (`<input type="datetime-local">`)
 *
 * `''` means no value. `min` / `max` are strings in the same format and bound
 * what can be picked. Convert to an instant at the edge — e.g.
 * `new Date(value).getTime()` reads a `datetime` value in the device zone —
 * rather than storing epoch milliseconds, which would force a zone onto a
 * date that has none.
 *
 * `kind` is STRUCTURAL here (a different control on every target), so it must
 * be static. A picker is never multi-line.
 */
export interface DateFieldProps extends FieldBaseProps {
  kind: 'date' | 'time' | 'datetime'
  multiline?: false
  lines?: never
  /** Earliest value that can be picked, in the `value` format. */
  min?: string
  /** Latest value that can be picked, in the `value` format. */
  max?: string
  onSubmit?: never
}

/**
 * `<Field>` — text input, a text area, or a date / time picker.
 *
 * Per-platform mapping:
 * - Web: `<input type=...>`; `<textarea rows>` with `multiline`; `date` / `time` / `datetime-local` for the date kinds
 * - iOS: `TextField` / `SecureField` (kind="password"); `TextField(axis: .vertical)` with `multiline`; `PyreonDateField` (a `DatePicker`) for the date kinds
 * - Android: single-line `TextField` with `KeyboardOptions`; `minLines`/`maxLines` with `multiline`; `PyreonDateField` (Material 3 date / time picker dialogs) for the date kinds
 */
export type FieldProps = SingleLineFieldProps | MultilineFieldProps | DateFieldProps

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
