/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h, splitProps, useControllableState } from '@pyreon/core'
import { el } from '../../factory'
import Input from '../Input'
import { IconButton } from '../Button'

/**
 * Layout wrapper: input + toggle side by side. Plain flex row — the Input
 * keeps its own styling; the toggle overlays at the end.
 */
const PasswordInputRoot = el
  .config({ name: 'PasswordInput' })
  .attrs({ tag: 'div', direction: 'inline',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center', alignY: 'center', block: true })
  .theme(() => ({
    position: 'relative',
  }))

export interface PasswordInputProps {
  /** Controlled visibility. */
  visible?: boolean
  /** Uncontrolled initial visibility (default false). */
  defaultVisible?: boolean
  /** Called when visibility toggles. */
  onVisibleChange?: (visible: boolean) => void
  /** Toggle label while the password is HIDDEN (default 'Show password'). */
  showLabel?: string
  /** Toggle label while the password is VISIBLE (default 'Hide password'). */
  hideLabel?: string
  /** Forwarded to the underlying `<Input>` (value/onInput/placeholder/…). */
  [key: string]: unknown
}

/**
 * Password input with a visibility toggle (the Mantine/Chakra staple).
 *
 * - The toggle is `type="button"` (never submits a form), announces state via
 *   `aria-pressed` (STRING) and a localizable label pair
 *   (`showLabel`/`hideLabel`).
 * - Visibility is controlled/uncontrolled via `useControllableState`
 *   (`visible` / `defaultVisible` / `onVisibleChange`).
 * - Every other prop (value, onInput, placeholder, autoComplete, name, …)
 *   forwards to the underlying `<Input>`, so password managers and forms see
 *   a normal input whose `type` flips between `'password'` and `'text'`.
 */
export const PasswordInput: ComponentFn<PasswordInputProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'visible',
    'defaultVisible',
    'onVisibleChange',
    'showLabel',
    'hideLabel',
  ])

  const [visible, setVisible] = useControllableState<boolean>({
    value: () => own.visible,
    defaultValue: own.defaultVisible ?? false,
    onChange: own.onVisibleChange,
  })

  // Accessors — live reads so the compiled/apply paths re-render on toggle.
  const label = () => (visible() ? (own.hideLabel ?? 'Hide password') : (own.showLabel ?? 'Show password'))

  return h(
    PasswordInputRoot as never,
    { gap: 4 },
    h(Input as never, {
      ...rest,
      type: () => (visible() ? 'text' : 'password'),
      'data-password-input': 'true',
    }),
    h(
      IconButton as never,
      {
        type: 'button',
        size: 'small',
        onClick: () => setVisible(!visible()),
        'aria-pressed': () => (visible() ? 'true' : 'false'),
        'aria-label': label,
        'data-password-toggle': 'true',
      },
      // Simple glyphs; consumers replace via children later if we add a slot.
      (() => (visible() ? '🙈' : '👁')) as unknown as VNodeChild,
    ),
  ) as unknown as VNodeChild
}

export default PasswordInput
