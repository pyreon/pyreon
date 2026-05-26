// Input primitive type definitions — Field / Toggle / Modal.

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
