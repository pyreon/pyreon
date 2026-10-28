// Input primitive type definitions — Field / Toggle / Select / Modal.

import type { ChildrenProp, HtmlPassthroughProps, ValueOrSignal } from './shared'

/**
 * `<Field>` — text input. The `kind` prop selects the keyboard +
 * autocomplete behavior per platform (e.g. `kind="email"` → email
 * keyboard on iOS/Android, `<input type="email">` on web).
 *
 * Per-platform mapping:
 * - Web: `<input type=...>`
 * - iOS: `TextField` / `SecureField` (kind="password")
 * - Android: `TextField` with `KeyboardOptions`
 */
export interface FieldProps extends HtmlPassthroughProps {
  value: ValueOrSignal<string>
  onChangeText: (next: string) => void
  kind?: 'text' | 'number' | 'password' | 'email' | 'search' | 'tel' | 'url'
  placeholder?: string
  disabled?: boolean
  /** Submit handler — wired to platform keyboard "Done" / Enter behavior. */
  onSubmit?: () => void
}

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

/** One choice of a `<Select>`. `value` is what `onChange` reports; `label` is what the user sees. */
export interface SelectOption {
  value: string
  label: string
  /** Shown but not selectable — `<option disabled>` on the web. */
  disabled?: boolean
}

/**
 * `<Select>` — choose one value from a list, with the platform's own picker.
 *
 * `value` is the selected option's `value`; `''` (or any value no option has)
 * means nothing is selected, and the `placeholder` — when given — is shown in
 * its place. The placeholder is never selectable again, as an
 * `<option value="" disabled>` is not on the web.
 *
 * Per-platform mapping:
 * - Web: `<select>` with an `<option>` per entry (and a disabled placeholder option)
 * - iOS: `Picker(…).pickerStyle(.menu)` — a native menu picker
 * - Android: Material 3 `ExposedDropdownMenuBox` — a read-only field that opens a menu
 */
export interface SelectProps extends HtmlPassthroughProps {
  value: ValueOrSignal<string>
  options: ValueOrSignal<readonly SelectOption[]>
  onChange: (next: string) => void
  placeholder?: string
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
