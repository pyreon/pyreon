// Input primitive type definitions — Field / Toggle / Modal.

import type { ChildrenProp, HtmlPassthroughProps, ValueOrSignal } from './shared'

/** Props every `<Field>` shape shares. */
export interface FieldBaseProps extends HtmlPassthroughProps {
  value: ValueOrSignal<string>
  onChangeText: (next: string) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * A text `<Field>` — the default. `kind` selects the keyboard + autocomplete
 * behavior per platform (e.g. `kind="email"` → email keyboard on iOS/Android,
 * `<input type="email">` on web).
 */
export interface SingleLineFieldProps extends FieldBaseProps {
  kind?: 'text' | 'number' | 'password' | 'email' | 'search' | 'tel' | 'url'
  /** Submit handler — wired to platform keyboard "Done" / Enter behavior. */
  onSubmit?: () => void
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
 * be static.
 */
export interface DateFieldProps extends FieldBaseProps {
  kind: 'date' | 'time' | 'datetime'
  /** Earliest value that can be picked, in the `value` format. */
  min?: string
  /** Latest value that can be picked, in the `value` format. */
  max?: string
  onSubmit?: never
}

/**
 * `<Field>` — text, or a date / time picker.
 *
 * Per-platform mapping:
 * - Web: `<input type=...>` (`date` / `time` / `datetime-local` for the date kinds)
 * - iOS: `TextField` / `SecureField` (kind="password"); `PyreonDateField` (a `DatePicker`) for the date kinds
 * - Android: `TextField` with `KeyboardOptions`; `PyreonDateField` (Material 3 date / time picker dialogs) for the date kinds
 */
export type FieldProps = SingleLineFieldProps | DateFieldProps

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
